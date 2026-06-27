"""
llm/gemini_client.py - One front door to the Gemini API for every agent.

Why this file exists:
  * Centralizes the genai client so feature code never re-implements auth.
  * Retries 503 "model overwhelmed" / rate-limit errors (common on freshly
    released models, per the hackathon doc) with exponential backoff, then
    falls back to a flash-tier model.
  * Enforces a hard per-process call ceiling (config.MAX_LLM_CALLS) so a runaway
    loop can never trip the abuse rule that disqualifies temp projects.
  * Logs every genai call (model, truncated prompt, config) and its output, per
    the documenting guidelines shipped with the temp account.

Usage:
    from llm.gemini_client import generate
    text = generate("Summarize this:", system="You are terse.")
"""
import logging
import time

from google import genai
from google.genai import types

import config

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
log = logging.getLogger("gemini")

_client = None
_call_count = 0


def _get_client():
    """Lazily build the genai client so importing this module never needs a key."""
    global _client
    if _client is None:
        if not config.GEMINI_API_KEY:
            raise RuntimeError(
                "GEMINI_API_KEY is empty. Put the Tier 3 key in .env (gitignored). "
                "Get it from aistudio.google.com/api-keys on the temp account."
            )
        _client = genai.Client(api_key=config.GEMINI_API_KEY)
    return _client


def _truncate(s, n=200):
    s = s or ""
    return s if len(s) <= n else s[:n] + f"... (+{len(s) - n} chars)"


def generate_full(prompt, system=None, model=None, temperature=0.7, json_schema=None):
    """
    Call Gemini and return a telemetry-rich result dict:
        {"text", "model", "status", "prompt_tokens", "completion_tokens",
         "total_tokens", "latency_ms"}

    Same retry / fallback / call-ceiling behavior as generate(). Workers use this
    so the flight-recorder can record tokens, latency, and cost per call.

    Raises:
        RuntimeError if the per-process call ceiling is exceeded, or if every
        retry (including the fallback model) fails.
    """
    global _call_count
    _call_count += 1
    if _call_count > config.MAX_LLM_CALLS:
        raise RuntimeError(
            f"LLM call ceiling hit ({config.MAX_LLM_CALLS}). Raise MAX_LLM_CALLS in "
            "config only if you are sure - the hackathon disqualifies abusive usage."
        )

    primary = model or config.GEMINI_MODEL
    cfg = types.GenerateContentConfig(
        system_instruction=system,
        temperature=temperature,
        response_mime_type="application/json" if json_schema else None,
        response_schema=json_schema,
    )

    last_err = None
    for model_name in (primary, config.GEMINI_FALLBACK_MODEL):
        for attempt in range(1, config.RETRY_MAX_ATTEMPTS + 1):
            t0 = time.time()
            try:
                log.info(
                    "genai call model=%s attempt=%d prompt=%r system=%r",
                    model_name, attempt, _truncate(prompt), _truncate(system),
                )
                resp = _get_client().models.generate_content(
                    model=model_name, contents=prompt, config=cfg,
                )
                out = resp.text or ""
                u = getattr(resp, "usage_metadata", None)
                pt = int(getattr(u, "prompt_token_count", 0) or 0)
                ct = int(getattr(u, "candidates_token_count", 0) or 0)
                tt = int(getattr(u, "total_token_count", 0) or (pt + ct))
                log.info("genai ok model=%s tokens=%d out=%r", model_name, tt, _truncate(out))
                return {
                    "text": out, "model": model_name, "status": "ok",
                    "prompt_tokens": pt, "completion_tokens": ct, "total_tokens": tt,
                    "latency_ms": int((time.time() - t0) * 1000),
                }
            except Exception as e:  # noqa: BLE001 - classified by message below
                last_err = e
                msg = str(e).lower()
                overloaded = any(
                    tok in msg
                    for tok in ("503", "overwhelmed", "unavailable", "resource_exhausted", "429")
                )
                if overloaded and attempt < config.RETRY_MAX_ATTEMPTS:
                    delay = config.RETRY_BASE_DELAY_S * (2 ** (attempt - 1))
                    log.warning(
                        "model=%s overloaded (%s); retrying in %.1fs",
                        model_name, _truncate(str(e), 80), delay,
                    )
                    time.sleep(delay)
                    continue
                # Not an overload, or out of attempts -> break to the fallback model.
                log.warning("model=%s failed: %s", model_name, _truncate(str(e), 120))
                break
        log.warning("falling back from %s to next model", model_name)

    raise RuntimeError(f"All Gemini attempts failed. Last error: {last_err}")


def generate(prompt, system=None, model=None, temperature=0.7, json_schema=None):
    """Convenience wrapper returning just the text (see generate_full for telemetry)."""
    return generate_full(
        prompt, system=system, model=model,
        temperature=temperature, json_schema=json_schema,
    )["text"]


def call_count():
    """How many LLM calls this process has made (recorded into telemetry)."""
    return _call_count
