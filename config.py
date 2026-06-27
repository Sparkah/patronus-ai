"""
config.py - Centralized configuration for the agent flight-recorder.

Every tunable lives here (model names, the LLM call budget, table names, service
endpoints) so nothing is hardcoded across feature files. This follows the coding
guidelines Google shipped with the temp-account doc.

Secrets are read from the environment (.env, gitignored). NEVER hardcode the
Gemini key here - a public push of it auto-kills the temp project.
"""
import os

from dotenv import load_dotenv

load_dotenv()  # read .env if present (gitignored)

# ---- Gemini / GenAI ---------------------------------------------------------
# Tier 3 temp-account key. Read from env only.
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")

# Primary model is the paid 3.1 Pro the temp account unlocks. If the exact id
# differs in AI Studio, llm/smoke_test.py lists the real ids so we can correct
# it via GEMINI_MODEL in .env.
GEMINI_MODEL = os.environ.get("GEMINI_MODEL") or "gemini-3.1-pro"
# Fallback when the primary returns 503 "model overwhelmed" (the doc warns this
# hits freshly released models). A flash-tier model absorbs the overflow.
GEMINI_FALLBACK_MODEL = os.environ.get("GEMINI_FALLBACK_MODEL") or "gemini-2.5-flash"

# ---- Abuse guard ------------------------------------------------------------
# The doc disqualifies projects doing "thousands of requests". Hard ceiling on
# total LLM calls per process so a runaway loop can never get us banned.
MAX_LLM_CALLS = int(os.environ.get("MAX_LLM_CALLS", "500"))

# Retry / backoff for 503s and rate limits.
RETRY_MAX_ATTEMPTS = 4
RETRY_BASE_DELAY_S = 1.5

# ---- Tavily -----------------------------------------------------------------
TAVILY_API_KEY = os.environ.get("TAVILY_API_KEY", "")

# ---- ClickHouse (telemetry store) -------------------------------------------
CLICKHOUSE_HOST = os.environ.get("CLICKHOUSE_HOST", "")
CLICKHOUSE_PORT = int(os.environ.get("CLICKHOUSE_PORT", "8443"))
CLICKHOUSE_USER = os.environ.get("CLICKHOUSE_USER", "default")
CLICKHOUSE_PASSWORD = os.environ.get("CLICKHOUSE_PASSWORD", "")
CLICKHOUSE_DATABASE = os.environ.get("CLICKHOUSE_DATABASE", "default")
EVENTS_TABLE = "agent_events"

# ---- Rough cost model (illustrative) ----------------------------------------
# Preview pricing is not public, so these are placeholder $/1M-token rates that
# let the dashboard show a cost axis. Tune when real numbers are known.
COST_PER_M_INPUT = float(os.environ.get("COST_PER_M_INPUT", "1.25"))
COST_PER_M_OUTPUT = float(os.environ.get("COST_PER_M_OUTPUT", "5.0"))


def estimate_cost(prompt_tokens, completion_tokens):
    """Rough USD cost for one call given its token counts."""
    return (
        (prompt_tokens / 1_000_000) * COST_PER_M_INPUT
        + (completion_tokens / 1_000_000) * COST_PER_M_OUTPUT
    )
