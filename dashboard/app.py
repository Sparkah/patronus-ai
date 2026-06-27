"""
dashboard/app.py - Agent Refinery backend + UI server.

Serves the terminal-style single-page UI and the endpoints it calls, all wired to
the real swarm + ClickHouse:
  POST /api/refine     {topic}  -> runs the refinery swarm + autopsy
  GET  /api/harvested           -> recent harvested_rows (the collected data)
  GET  /api/telemetry           -> recent llm_call events (the flight recorder)
  POST /api/query      {query}  -> read-only SQL over ClickHouse (the hero console)
Run: uvicorn dashboard.app:app --host 127.0.0.1 --port 8800
"""
import json
import os
import time

import clickhouse_connect
from fastapi import FastAPI
from fastapi.responses import HTMLResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware

import config
import refinery

app = FastAPI(title="Agent Refinery")
# Allow the Chrome extension (chrome-extension:// origin) to call these endpoints.
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
_HTML = os.path.join(os.path.dirname(__file__), "index.html")


def _client(readonly=False):
    settings = {"readonly": 1} if readonly else {}
    return clickhouse_connect.get_client(
        host=config.CLICKHOUSE_HOST, port=config.CLICKHOUSE_PORT,
        username=config.CLICKHOUSE_USER, password=config.CLICKHOUSE_PASSWORD,
        database=config.CLICKHOUSE_DATABASE, secure=True, settings=settings,
    )


@app.get("/", response_class=HTMLResponse)
def index():
    with open(_HTML) as f:
        return f.read()


@app.post("/api/refine")
def refine(body: dict):
    topic = (body or {}).get("topic", "").strip()
    if not topic:
        return {"error": "no topic provided"}
    try:
        return refinery.refine(topic)
    except Exception as e:  # noqa: BLE001
        return {"error": str(e)[:300]}


@app.get("/api/refine/stream")
def refine_stream(topic: str = ""):
    """Server-Sent Events: emits one event per sponsor stage as it completes."""
    topic = (topic or "").strip()
    if not topic:
        def empty():
            yield "data: " + json.dumps({"stage": "done", "error": "no topic", "findings": []}) + "\n\n"
        return StreamingResponse(empty(), media_type="text/event-stream")

    def gen():
        try:
            yield from refinery.refine_stream(topic)
        except Exception as e:  # noqa: BLE001
            yield "data: " + json.dumps({"stage": "done", "error": str(e)[:300], "findings": []}) + "\n\n"

    return StreamingResponse(gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.post("/api/page")
def page(body: dict):
    """Active mode: answer using the current page's text + links; flag if a site search is wanted."""
    text = (body or {}).get("text", "") or ""
    question = (body or {}).get("question", "").strip()
    links = (body or {}).get("links") or []
    if not question:
        return {"error": "no question"}
    try:
        return refinery.answer_page(text, question, links)
    except Exception as e:  # noqa: BLE001
        return {"error": str(e)[:300]}


@app.get("/api/harvested")
def harvested():
    try:
        rows = _client().query(
            "SELECT topic, mechanic, source, sentiment, claim FROM harvested_rows "
            "ORDER BY ts DESC LIMIT 100").result_rows
    except Exception:
        return []
    return [{"id": i + 1, "topic": t, "mechanic": m, "source": s, "sentiment": se, "claim": c}
            for i, (t, m, s, se, c) in enumerate(rows)]


@app.get("/api/telemetry")
def telemetry():
    try:
        rows = _client().query(
            "SELECT agent_id, task, latency_ms, total_tokens, cost_usd FROM agent_events "
            "WHERE event_type = 'llm_call' ORDER BY ts DESC LIMIT 100").result_rows
    except Exception:
        return []
    return [{"agent_name": a, "task": tk, "latency_ms": lat, "tokens": tok, "cost_usd": cost}
            for a, tk, lat, tok, cost in rows]


_BLOCKED = ("insert", "alter", "drop", "delete", "update", "create", "attach",
            "detach", "truncate", "rename", "grant", "optimize", "system")


@app.post("/api/query")
def query(body: dict):
    sql = (body or {}).get("query", "").strip().rstrip(";")
    low = sql.lower()
    if not (low.startswith("select") or low.startswith("with")):
        return {"error": "only read-only SELECT queries are allowed"}
    if ";" in sql or any(w in low.split() for w in _BLOCKED):
        return {"error": "query rejected (read-only console)"}
    t0 = time.time()
    try:
        res = _client(readonly=True).query(sql)
        cols = list(res.column_names)
        rows = [dict(zip(cols, r)) for r in res.result_rows[:200]]
        return {"columns": cols, "rows": rows, "latency_ms": int((time.time() - t0) * 1000)}
    except Exception as e:  # noqa: BLE001
        return {"error": str(e)[:300]}
