"""
agents/worker.py - A worker agent in the swarm.

Takes a task, optionally grounds it with a Tavily search, reasons with Gemini,
and emits structured telemetry (run_start, tool_call, llm_call, run_end) into the
ClickHouse sink. That telemetry is what the flight-recorder replays: exactly what
each agent did, how long it took, how many tokens it burned, and what it cost.
"""
import time
import uuid

import config
from llm.gemini_client import generate_full
from telemetry.events import AgentEvent


def _maybe_search(task, run_id, agent_id, sink):
    """Run a Tavily search if a key is configured; emit a tool_call event either way."""
    if not config.TAVILY_API_KEY:
        return ""
    from search.tavily_client import search

    t0 = time.time()
    try:
        res = search(task, max_results=4)
        ctx = "\n".join(
            f"- {r['title']}: {r['content']}" for r in res["results"] if r.get("content")
        )
        sink.emit(AgentEvent(
            run_id, agent_id, event_type="tool_call", tool="tavily_search",
            task=task, status="ok", latency_ms=int((time.time() - t0) * 1000),
            detail={"results": len(res["results"])},
        ))
        return ctx
    except Exception as e:  # noqa: BLE001
        sink.emit(AgentEvent(
            run_id, agent_id, event_type="tool_call", tool="tavily_search",
            task=task, status="fail", latency_ms=int((time.time() - t0) * 1000),
            detail={"error": str(e)[:200]},
        ))
        return ""


def run_task(task, run_id, sink, agent_id=None):
    """
    Execute one task end to end, emitting telemetry at each step.

    Returns dict: {"agent_id", "output", "status", "total_tokens", "cost_usd"}.
    """
    agent_id = agent_id or ("w-" + uuid.uuid4().hex[:6])
    sink.emit(AgentEvent(run_id, agent_id, event_type="run_start", task=task))

    context = _maybe_search(task, run_id, agent_id, sink)

    prompt = (
        f"Task: {task}\n\n"
        f"Context from web search:\n{context or '(none)'}\n\n"
        "Produce a concise, well-structured answer (5 sentences max). "
        "If the context is empty, answer from your own knowledge."
    )
    try:
        r = generate_full(prompt, system="You are a precise research worker.")
        status = "ok"
    except Exception as e:  # noqa: BLE001
        r = {"text": "", "model": config.GEMINI_MODEL, "prompt_tokens": 0,
             "completion_tokens": 0, "total_tokens": 0, "latency_ms": 0}
        status = "fail"

    cost = config.estimate_cost(r["prompt_tokens"], r["completion_tokens"])
    sink.emit(AgentEvent(
        run_id, agent_id, event_type="llm_call", model=r["model"], task=task,
        status=status, latency_ms=r["latency_ms"], prompt_tokens=r["prompt_tokens"],
        completion_tokens=r["completion_tokens"], total_tokens=r["total_tokens"],
        cost_usd=cost, detail={"out_preview": r["text"][:200]},
    ))
    sink.emit(AgentEvent(
        run_id, agent_id, event_type="run_end", task=task, status=status,
    ))
    return {"agent_id": agent_id, "output": r["text"], "status": status,
            "total_tokens": r["total_tokens"], "cost_usd": cost}
