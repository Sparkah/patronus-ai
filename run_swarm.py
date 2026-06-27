"""
run_swarm.py - Local orchestrator. Fan out a pool of worker agents over a task
list, all streaming telemetry into ClickHouse in real time. The Modal version in
runtime/modal_app.py runs the same workers serverless.

Usage:
    python run_swarm.py                      # built-in demo task list
    python run_swarm.py "task one" "two"     # custom tasks
"""
import sys
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed

from agents.worker import run_task
from telemetry.clickhouse_sink import ClickHouseSink

DEMO_TASKS = [
    "Summarize the main risks of multi-agent LLM systems.",
    "What is ClickHouse best suited for compared to Postgres?",
    "Explain how Tavily differs from a raw web scraper.",
    "List three failure modes of autonomous coding agents.",
]


def main(tasks):
    run_id = "run-" + uuid.uuid4().hex[:8]
    sink = ClickHouseSink(batch_size=10)
    sink.ensure_schema()
    print(f"run_id={run_id}  tasks={len(tasks)}  workers=4")

    results = []
    with ThreadPoolExecutor(max_workers=4) as ex:
        futures = {ex.submit(run_task, t, run_id, sink): t for t in tasks}
        for fut in as_completed(futures):
            res = fut.result()
            results.append(res)
            print(f"  [{res['status']}] {res['agent_id']} "
                  f"tokens={res['total_tokens']} cost=${res['cost_usd']:.4f}")

    sink.flush()
    ok = sum(1 for r in results if r["status"] == "ok")
    total_tokens = sum(r["total_tokens"] for r in results)
    total_cost = sum(r["cost_usd"] for r in results)
    print(f"DONE run_id={run_id}  ok={ok}/{len(results)}  "
          f"tokens={total_tokens}  cost=${total_cost:.4f}")
    print("Inspect:  SELECT event_type, count() FROM agent_events "
          f"WHERE run_id='{run_id}' GROUP BY event_type")
    return run_id


if __name__ == "__main__":
    main(sys.argv[1:] or DEMO_TASKS)
