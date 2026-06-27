"""
search/tavily_client.py - Tavily agentic web search: the workers' hands.

Tavily collapses search + fetch + de-boilerplate + rank into one call and returns
clean, relevance-ranked text ready to drop into an LLM context. That is the
difference from a raw scraper, which just dumps one page's HTML and leaves the
agent to find the URL and wade through nav/ads/boilerplate itself. Workers call
search() to gather grounding before they reason.
"""
import logging

from tavily import TavilyClient

import config

log = logging.getLogger("tavily")
_client = None


def _get_client():
    """Lazily build the Tavily client so importing this module never needs a key."""
    global _client
    if _client is None:
        if not config.TAVILY_API_KEY:
            raise RuntimeError("TAVILY_API_KEY is empty. Put it in .env (app.tavily.com).")
        _client = TavilyClient(api_key=config.TAVILY_API_KEY)
    return _client


def search(query, max_results=5, depth="basic", include_answer=True):
    """
    Run an agentic web search.

    Args:
        query: natural-language query (str).
        max_results: how many ranked sources to return (int).
        depth: "basic" (fast) or "advanced" (deeper crawl) (str).
        include_answer: ask Tavily for a short synthesized answer too (bool).

    Returns:
        dict: {
          "answer":  str | None,
          "results": [{"title", "url", "content", "score"}, ...]  # ranked, cleaned
        }
    """
    log.info("tavily search q=%r depth=%s n=%d", query, depth, max_results)
    resp = _get_client().search(
        query=query,
        max_results=max_results,
        search_depth=depth,
        include_answer=include_answer,
    )
    results = [
        {
            "title": r.get("title"),
            "url": r.get("url"),
            "content": r.get("content"),
            "score": r.get("score"),
        }
        for r in resp.get("results", [])
    ]
    log.info("tavily got %d results", len(results))
    return {"answer": resp.get("answer"), "results": results}
