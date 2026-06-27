"""
agents/meta.py - The autopsy agent.

After a swarm run, it queries the ClickHouse telemetry the workers produced,
summarizes the run (cost, tokens, latency, failures, slowest agents), and asks
Gemini to diagnose what went wrong and propose concrete fixes for the next run.

This is the project's differentiator: an agent reasoning over the swarm's own
flight-recorder data. The meta-agent records its own activity too, so it shows
up on the same dashboard it is analyzing.
"""
import json
import uuid

import clickhouse_connect

import config
from llm.gemini_client import generate_full
from telemetry.events import AgentEvent


def _read_client():
    return clickhouse_connect.get_client(
        host=config.CLICKHOUSE_HOST, port=config.CLICKHOUSE_PORT,
        username=config.CLICKHOUSE_USER, password=config.CLICKHOUSE_PASSWORD,
        database=config.CLICKHOUSE_DATABASE, secure=True,
    )


def summarize_run(run_id):
    """Pull the key telemetry facts for a run into a compact dict for the LLM."""
    c = _read_client()

    def q(sql):
        return c.query(sql, parameters={"r": run_id}).result_rows

    totals = q("SELECT count(), sum(total_tokens), round(sum(cost_usd), 5) "
               "FROM agent_events WHERE run_id = {r:String}")[0]
    by_status = dict(q("SELECT status, count() FROM agent_events "
                       "WHERE run_id = {r:String} GROUP BY status"))
    per_agent = q("SELECT agent_id, sum(total_tokens) AS t, max(latency_ms) AS lat, "
                  "anyIf(status, status != 'ok') AS bad FROM agent_events "
                  "WHERE run_id = {r:String} GROUP BY agent_id ORDER BY t DESC")
    failures = q("SELECT agent_id, event_type, tool, detail FROM agent_events "
                 "WHERE run_id = {r:String} AND status = 'fail'")
    slow = q("SELECT agent_id, task, latency_ms FROM agent_events "
             "WHERE run_id = {r:String} AND event_type = 'llm_call' "
             "ORDER BY latency_ms DESC LIMIT 3")

    return {
        "run_id": run_id,
        "events": totals[0], "total_tokens": totals[1], "cost_usd": totals[2],
        "by_status": by_status,
        "per_agent": [{"agent": a, "tokens": t, "max_latency_ms": lat, "bad": bad}
                      for a, t, lat, bad in per_agent],
        "failures": [{"agent": a, "event": e, "tool": tl, "detail": d}
                     for a, e, tl, d in failures],
        "slowest": [{"agent": a, "task": tk, "latency_ms": l} for a, tk, l in slow],
    }


def autopsy(run_id, sink=None):
    """Diagnose a run from its ClickHouse telemetry. Returns {summary, diagnosis}."""
    summary = summarize_run(run_id)
    agent_id = "meta-" + uuid.uuid4().hex[:6]
    if sink:
        sink.emit(AgentEvent(run_id, agent_id, agent_role="meta",
                             event_type="run_start", task="autopsy"))

    prompt = (
        "You are the autopsy agent for a multi-agent swarm. Below is the run's "
        "telemetry pulled from ClickHouse. Diagnose it: (1) what failed or is at "
        "risk, (2) where the tokens / cost / latency went, (3) three concrete, "
        "specific fixes for the next run. Be terse and technical.\n\n"
        f"TELEMETRY:\n{json.dumps(summary, indent=2)}"
    )
    r = generate_full(prompt, system="You are a precise systems diagnostician.",
                      temperature=0.3)

    if sink:
        cost = config.estimate_cost(r["prompt_tokens"], r["completion_tokens"])
        sink.emit(AgentEvent(run_id, agent_id, agent_role="meta", event_type="llm_call",
                             model=r["model"], task="autopsy", status="ok",
                             latency_ms=r["latency_ms"], prompt_tokens=r["prompt_tokens"],
                             completion_tokens=r["completion_tokens"],
                             total_tokens=r["total_tokens"], cost_usd=cost))
        # Persist the diagnosis into the flight record so the dashboard can show it.
        sink.emit(AgentEvent(run_id, agent_id, agent_role="meta", event_type="autopsy",
                             task="autopsy", status="ok", detail={"diagnosis": r["text"]}))
        sink.emit(AgentEvent(run_id, agent_id, agent_role="meta",
                             event_type="run_end", task="autopsy", status="ok"))
        sink.flush()

    return {"summary": summary, "diagnosis": r["text"]}
