"""
llm/smoke_test.py - Confirm the temp-account key works and discover the real
model ids before we build on top of them.

Run AFTER putting GEMINI_API_KEY in .env, from the repo root:
    python -m llm.smoke_test

It (1) lists the models this account can see (so we lock the exact 3.1 Pro id),
and (2) does one tiny generate call through the real client + retry path.
"""
import config
from llm import gemini_client


def main():
    if not config.GEMINI_API_KEY:
        print("GEMINI_API_KEY is empty. Put the Tier 3 key in .env first.")
        return

    client = gemini_client._get_client()

    print("== Models visible to this account ==")
    try:
        for m in client.models.list():
            name = getattr(m, "name", str(m))
            print(" -", name)
    except Exception as e:  # noqa: BLE001
        print("Could not list models:", e)

    print(f"\n== Test generation (model={config.GEMINI_MODEL}) ==")
    try:
        out = gemini_client.generate(
            "Reply with exactly: flight-recorder online",
            system="You are a terse status probe.",
            temperature=0,
        )
        print("OUTPUT:", out)
        print("\nOK - key works. LLM calls so far:", gemini_client.call_count())
    except Exception as e:  # noqa: BLE001
        print("Generation failed:", e)
        print(
            "If this is a 'model not found', pick the right id from the list "
            "above and set GEMINI_MODEL in .env."
        )


if __name__ == "__main__":
    main()
