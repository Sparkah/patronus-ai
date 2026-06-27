"""
refinery.py - The Agent Refinery run, with a live streaming mode.

A swarm of worker agents turns a topic into structured rows in ClickHouse
(harvested_rows) while emitting telemetry into agent_events, then a meta-agent
audits both. Works on Gemini alone; if a Tavily key is present, workers ground
their findings in real web search first.

refine_stream() yields Server-Sent-Event strings so the UI can animate each
sponsor stage (Tavily -> Gemini -> ClickHouse -> Gemini auditor) as it happens.
"""
import json
import re
import time
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed

import clickhouse_connect

import config
from llm.gemini_client import generate_full
from telemetry.clickhouse_sink import ClickHouseSink
from telemetry.events import AgentEvent, now_iso

HARVEST_DDL = """
CREATE TABLE IF NOT EXISTS harvested_rows (
  ts        DateTime64(3),
  run_id    String,
  topic     String,
  mechanic  String,
  source    String,
  sentiment LowCardinality(String),
  claim     String
) ENGINE = MergeTree PARTITION BY toDate(ts) ORDER BY (run_id, ts)
"""
HARVEST_COLS = ["ts", "run_id", "topic", "mechanic", "source", "sentiment", "claim"]

ANGLES = [
    "community discussion",
    "new indie releases",
    "monetization and retention",
    "press and analyst coverage",
]


def client():
    return clickhouse_connect.get_client(
        host=config.CLICKHOUSE_HOST, port=config.CLICKHOUSE_PORT,
        username=config.CLICKHOUSE_USER, password=config.CLICKHOUSE_PASSWORD,
        database=config.CLICKHOUSE_DATABASE, secure=True,
    )


def ensure_schema():
    client().command(HARVEST_DDL)


def _sse(obj):
    return "data: " + json.dumps(obj) + "\n\n"


def _extract_json_array(text):
    t = (text or "").strip()
    t = re.sub(r"^```(?:json)?", "", t).strip().strip("`")
    i, j = t.find("["), t.rfind("]")
    if i >= 0 and j > i:
        try:
            return json.loads(t[i:j + 1])
        except Exception:
            return []
    return []


def _worker(topic, angle, run_id, sink):
    """One worker: optional Tavily grounding, then Gemini structures findings.
    Returns {"findings": [...], "sources": int}."""
    agent_id = "worker-" + angle.split()[0].lower()
    sink.emit(AgentEvent(run_id, agent_id, event_type="run_start", task=f"{topic} :: {angle}"))

    context, sources, urls = "", 0, []
    if config.TAVILY_API_KEY:
        from search.tavily_client import search
        t0 = time.time()
        try:
            res = search(f"{topic} {angle}", max_results=4)
            sources = len(res["results"])
            urls = [x.get("url") for x in res["results"] if x.get("url")]
            context = "\n".join(
                f"- {r['title']}: {r['content']}" for r in res["results"] if r.get("content"))
            sink.emit(AgentEvent(run_id, agent_id, event_type="tool_call", tool="tavily_search",
                                 task=angle, latency_ms=int((time.time() - t0) * 1000),
                                 detail={"sources": sources}))
        except Exception as e:  # noqa: BLE001
            sink.emit(AgentEvent(run_id, agent_id, event_type="tool_call", tool="tavily_search",
                                 task=angle, status="fail", detail={"error": str(e)[:150]}))

    prompt = (
        f"Topic: {topic}\nAngle: {angle}\n"
        + (f"\nWeb search context:\n{context}\n" if context else "")
        + "\nList 3 specific, distinct findings about this topic from this angle. "
        "Return ONLY a JSON array of objects with keys: "
        "mechanic (short trend/mechanic name), "
        "source (a real source domain like reddit.com or itch.io"
        + (", taken from the web context above" if context else "")
        + "), sentiment (one of positive, neutral, negative), "
        "claim (one factual sentence). No prose, JSON array only."
    )
    r = generate_full(prompt, system="You are a precise game-industry trend analyst. Output strict JSON.")
    findings = _extract_json_array(r["text"])

    sink.emit(AgentEvent(
        run_id, agent_id, event_type="llm_call", model=r["model"], task=angle,
        latency_ms=r["latency_ms"], prompt_tokens=r["prompt_tokens"],
        completion_tokens=r["completion_tokens"], total_tokens=r["total_tokens"],
        cost_usd=config.estimate_cost(r["prompt_tokens"], r["completion_tokens"]),
        detail={"findings": len(findings)},
    ))
    sink.emit(AgentEvent(run_id, agent_id, event_type="run_end", task=angle))

    out = []
    for f in findings[:5]:
        if not isinstance(f, dict):
            continue
        out.append({
            "mechanic": str(f.get("mechanic", ""))[:200],
            "source": str(f.get("source", ""))[:200],
            "sentiment": (str(f.get("sentiment", "neutral")).lower().strip() or "neutral")[:20],
            "claim": str(f.get("claim", ""))[:500],
        })
    return {"findings": out, "sources": sources, "angle": angle, "urls": urls,
            "query": (f"{topic} {angle}" if config.TAVILY_API_KEY else None),
            "model": r["model"], "tokens": r["total_tokens"], "latency_ms": r["latency_ms"],
            "raw": (r["text"] or "")[:1200]}


def _hero_query(run_id):
    """The ClickHouse 'hero' aggregation over this run's harvested rows."""
    sql = ("SELECT mechanic, count() AS mentions, uniqExact(source) AS sources "
           "FROM harvested_rows WHERE run_id = {r:String} "
           "GROUP BY mechanic ORDER BY mentions DESC LIMIT 6")
    t0 = time.time()
    res = client().query(sql, parameters={"r": run_id})
    cols = list(res.column_names)
    rows = [dict(zip(cols, row)) for row in res.result_rows]
    return cols, rows, int((time.time() - t0) * 1000)


def _autopsy(topic, run_id, n_rows, sink):
    c = client()
    top = c.query(
        "SELECT mechanic, count() AS m, uniqExact(source) AS s FROM harvested_rows "
        "WHERE run_id = {r:String} GROUP BY mechanic ORDER BY m DESC LIMIT 8",
        parameters={"r": run_id}).result_rows
    tel = c.query(
        "SELECT count(), sum(total_tokens), round(sum(cost_usd), 5), round(avg(latency_ms)) "
        "FROM agent_events WHERE run_id = {r:String} AND event_type = 'llm_call'",
        parameters={"r": run_id}).result_rows[0]
    summary = {
        "topic": topic, "harvested_rows": n_rows,
        "top_mechanics": [{"mechanic": m, "mentions": mm, "distinct_sources": s} for m, mm, s in top],
        "llm_calls": tel[0], "total_tokens": tel[1] or 0,
        "cost_usd": tel[2] or 0, "avg_latency_ms": tel[3] or 0,
    }
    prompt = (
        "You are the meta-agent auditor for a multi-agent data refinery. Below is this "
        "run's result pulled from ClickHouse - the harvested findings AND the swarm's own "
        "telemetry. Write a concise markdown report with exactly these sections:\n"
        "## Insights (the top trends from the harvested data)\n"
        "## Swarm Performance (tokens, cost, latency, any risks)\n"
        "## Recommendations (three concrete next steps)\n\n"
        f"DATA:\n{json.dumps(summary, indent=2)}"
    )
    r = generate_full(prompt, system="You are a precise systems and market analyst.", temperature=0.3)
    sink.emit(AgentEvent(
        run_id, "meta-auditor", agent_role="meta", event_type="llm_call", model=r["model"],
        task="autopsy", latency_ms=r["latency_ms"], prompt_tokens=r["prompt_tokens"],
        completion_tokens=r["completion_tokens"], total_tokens=r["total_tokens"],
        cost_usd=config.estimate_cost(r["prompt_tokens"], r["completion_tokens"]),
    ))
    sink.flush()
    return r["text"], summary


def refine_stream(topic):
    """Generator yielding SSE strings as each sponsor stage completes."""
    run_id = "refinery-" + uuid.uuid4().hex[:8]
    grounded = bool(config.TAVILY_API_KEY)
    ensure_schema()
    sink = ClickHouseSink(batch_size=200)
    sink.ensure_schema()

    yield _sse({"stage": "start", "topic": topic, "run_id": run_id, "grounded": grounded})
    yield _sse({"stage": "tavily", "status": "active", "logs": [{"box": "tavily",
        "line": (f"searching the web for '{topic}' across {len(ANGLES)} angles" if grounded
                 else "no Tavily key - answering from Gemini's own knowledge"), "raw": ""}]})
    yield _sse({"stage": "gemini", "status": "active", "total": len(ANGLES), "logs": [{"box": "gemini",
        "line": f"spawning {len(ANGLES)} agents to read & structure", "raw": ""}]})

    findings, sources = [], 0
    with ThreadPoolExecutor(max_workers=4) as ex:
        futs = {ex.submit(_worker, topic, a, run_id, sink): a for a in ANGLES}
        done = 0
        for fut in as_completed(futs):
            res = fut.result()
            findings += res["findings"]
            sources += res["sources"]
            done += 1
            logs = []
            if grounded and res.get("query"):
                logs.append({"box": "tavily",
                             "line": f"\"{res['angle']}\" search -> {res['sources']} sources",
                             "raw": "query: " + res["query"] + "\n" + "\n".join(res.get("urls") or [])})
            logs.append({"box": "gemini",
                         "line": f"agent '{res['angle']}': {len(res['findings'])} findings "
                                 f"({res['tokens']} tok, {res['latency_ms']}ms)",
                         "raw": f"model: {res['model']}\noutput:\n{res['raw']}"})
            yield _sse({"stage": "worker_done", "angle": futs[fut], "done": done,
                        "total": len(ANGLES), "rows": len(res["findings"]), "logs": logs})
    sink.flush()

    yield _sse({"stage": "tavily_done", "sources": sources, "grounded": grounded})
    yield _sse({"stage": "gemini_done", "findings": len(findings)})

    if findings:
        rows = [(now_iso(), run_id, topic, d["mechanic"], d["source"], d["sentiment"], d["claim"])
                for d in findings]
        client().insert("harvested_rows", rows, column_names=HARVEST_COLS)
    yield _sse({"stage": "clickhouse_store", "rows": len(findings), "logs": [{"box": "clickhouse",
        "line": f"INSERT {len(findings)} rows -> harvested_rows",
        "raw": "INSERT INTO harvested_rows (" + ", ".join(HARVEST_COLS) + ") VALUES ...  -- "
               + str(len(findings)) + " rows"}]})

    cols, qrows, qms = _hero_query(run_id)
    qsql = ("SELECT mechanic, count() AS mentions, uniqExact(source) AS sources\n"
            "FROM harvested_rows WHERE run_id = '" + run_id + "'\n"
            "GROUP BY mechanic ORDER BY mentions DESC LIMIT 6")
    yield _sse({"stage": "clickhouse_query", "columns": cols, "rows": qrows, "latency_ms": qms,
                "logs": [{"box": "clickhouse", "line": f"hero query -> {len(qrows)} rows in {qms}ms",
                          "raw": qsql + "\n\n" + json.dumps(qrows, indent=2)}]})

    yield _sse({"stage": "audit", "status": "active", "logs": [{"box": "audit",
        "line": "auditor querying harvested_rows + agent_events (double-read)...", "raw": ""}]})
    autopsy, summary = _autopsy(topic, run_id, len(findings), sink)

    yield _sse({"stage": "done", "run_id": run_id, "topic": topic, "grounded": grounded,
                "harvested_rows_count": len(findings), "findings": findings,
                "autopsy": autopsy, "summary": summary,
                "query": {"columns": cols, "rows": qrows, "latency_ms": qms},
                "logs": [{"box": "audit", "line": f"report ready - {len(autopsy)} chars",
                          "raw": json.dumps(summary, indent=2)}]})


def refine(topic):
    """Non-streaming variant (kept for /api/refine compatibility)."""
    run_id = "refinery-" + uuid.uuid4().hex[:8]
    ensure_schema()
    sink = ClickHouseSink(batch_size=200)
    sink.ensure_schema()
    with ThreadPoolExecutor(max_workers=4) as ex:
        results = list(ex.map(lambda a: _worker(topic, a, run_id, sink), ANGLES))
    sink.flush()
    findings = [d for sub in results for d in sub["findings"]]
    if findings:
        rows = [(now_iso(), run_id, topic, d["mechanic"], d["source"], d["sentiment"], d["claim"])
                for d in findings]
        client().insert("harvested_rows", rows, column_names=HARVEST_COLS)
    autopsy, _ = _autopsy(topic, run_id, len(findings), sink)
    return {"run_id": run_id, "harvested_rows_count": len(findings), "autopsy": autopsy,
            "grounded": bool(config.TAVILY_API_KEY), "topic": topic, "findings": findings}


def answer_page(page_text, question, links=None):
    """Active (this-page) mode: answer using only the page text, and surface the most
    relevant on-page links so the user can open them. Logs telemetry to ClickHouse."""
    run_id = "page-" + uuid.uuid4().hex[:8]
    sink = ClickHouseSink()
    sink.ensure_schema()
    sink.emit(AgentEvent(run_id, "page-reader", event_type="run_start", task=question[:200]))

    links = links or []
    link_lines = "\n".join(
        f"- {(l.get('text') or '')[:80]} | {l.get('href')}" for l in links[:60] if l.get("href"))
    prompt = (
        "You are a friendly in-browser assistant reading ONE web page. Answer the user's request using "
        "ONLY the page content. From the LINKS list, pick up to 4 links most relevant to the request "
        "(use ONLY urls from that list; empty array if none fit). Also set wants_search: true if the "
        "user is trying to find, browse, or buy something this page does NOT already resolve, so we "
        "should run the site's own search; otherwise false.\n"
        'Return STRICT JSON only: {"answer": "<concise friendly answer, **bold** allowed>", '
        '"links": [{"label": "<short label>", "url": "<url from the list>"}], "wants_search": <bool>}\n\n'
        f"PAGE CONTENT:\n{(page_text or '')[:16000]}\n\nLINKS:\n{link_lines}\n\nUSER REQUEST: {question}"
    )
    r = generate_full(prompt, system="Answer strictly from the page. Output strict JSON only.")

    data = {}
    t = re.sub(r"^```(?:json)?", "", r["text"].strip()).strip().strip("`")
    a, b = t.find("{"), t.rfind("}")
    if a >= 0 and b > a:
        try:
            data = json.loads(t[a:b + 1])
        except Exception:
            data = {}
    answer = (data.get("answer") if isinstance(data, dict) else None) or r["text"]

    allowed = {l.get("href") for l in links}
    safe_links = []
    for l in (data.get("links") if isinstance(data, dict) else None) or []:
        if isinstance(l, dict) and l.get("url") in allowed:
            safe_links.append({"label": str(l.get("label") or l["url"])[:80], "url": l["url"]})

    sink.emit(AgentEvent(
        run_id, "page-reader", event_type="llm_call", model=r["model"], task=question[:200],
        latency_ms=r["latency_ms"], prompt_tokens=r["prompt_tokens"],
        completion_tokens=r["completion_tokens"], total_tokens=r["total_tokens"],
        cost_usd=config.estimate_cost(r["prompt_tokens"], r["completion_tokens"])))
    sink.emit(AgentEvent(run_id, "page-reader", event_type="run_end", task=question[:200]))
    sink.flush()
    wants_search = bool(data.get("wants_search")) if isinstance(data, dict) else False
    return {"answer": answer, "links": safe_links[:4], "wants_search": wants_search,
            "run_id": run_id, "tokens": r["total_tokens"]}
