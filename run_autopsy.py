"""
run_autopsy.py - Run the meta/autopsy agent over a completed swarm run.

Usage:
    python run_autopsy.py <run_id>
"""
import sys

from agents.meta import autopsy
from telemetry.clickhouse_sink import ClickHouseSink


def main(run_id):
    sink = ClickHouseSink()
    out = autopsy(run_id, sink=sink)
    s = out["summary"]
    print("=== RUN SUMMARY ===")
    print(f"events={s['events']}  tokens={s['total_tokens']}  "
          f"cost=${s['cost_usd']}  status={s['by_status']}")
    print("\n=== AUTOPSY (meta-agent reasoning over ClickHouse) ===")
    print(out["diagnosis"])


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("usage: python run_autopsy.py <run_id>")
        sys.exit(1)
    main(sys.argv[1])
