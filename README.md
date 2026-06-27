# 🪄 Patronus AI

**Pick a meme guardian. It lives on every page, talks back in a real voice, and
actually does things - searches stores for you, researches the web, plays games,
goes wild on command. Collect a new soul every day.**

Built at the {Tech: Europe} London AI Hackathon. **Open Innovation** track.
90-second demo: see [`DEMO.md`](DEMO.md).

A Patronus is an animated character (surf-internet granny, Tung Tung, a wizard named
Harry, a smug cat...) that overlays onto every page via Shadow DOM. Not a sidebar
chatbot - a creature on your screen that bobs, naps, surfs across the page, talks out
loud, and takes real actions when you ask.

## What it does
- **Agentic shopping (visible).** "find me adidas flip flops" -> the character walks to
  the site's own search bar, types it, lands on results, and recommends specific
  products with a one-line reason each. Works by driving the page, not guessing URLs.
- **Web research.** "what do reviews say about X" -> grounded answer with sources.
- **Page Q&A.** "summarize this page."
- **Voice both ways.** It speaks every reply (SLNG); press the mic to talk to it.
- **Play games.** "play the brainrot game" -> a factory game opens in an in-browser overlay.
- **Go wild.** "do a dance" / "fly around" -> it zooms the screen with confetti.
- **Souls + memory.** 7 characters, each a distinct persona (`souls/<id>.md`) with its
  own voice and its own chat history. One stays locked as the daily "coming soon" unlock.

## The sponsor stack (each one load-bearing, visible in the UI)
Every action is tagged on screen with the sponsors that powered it.
- **Gemini (Google DeepMind)** - the brain: intent routing, product reasoning, page Q&A;
  plus all character art (Imagen / gemini-3-pro-image) and Veo animations.
- **SLNG** - the voice: every reply spoken in-character; mic for voice input.
- **Tavily** - the eyes: real web research with sources.
- **Mubit / Minima** - the metabolism: picks the cheapest capable model per call, shown
  live in each reply's tag.
- **Aikido** - security scanning over this repo.
- **Superlinked** - semantic memory (optional; shown as "coming soon" until its cluster
  endpoint is set).

Uses 4 partner techs live (Gemini, SLNG, Tavily, Mubit) - past the 3 required.

## Architecture
Manifest V3 Chrome extension, no server required:
- `extension/content.js` - the on-page character (Shadow DOM), animation, voice, the
  agentic dispatch, the visible search, and the game overlay.
- `extension/background.js` - service worker. Calls Gemini, SLNG, Tavily and Mubit
  directly; routes intent; hands site-searches to the opened tab.
- `extension/popup.js` - the soul collection + the powers strip.
- `extension/souls/*.md` - the personalities. `extension/chars/*` - art + Veo loops.
- Keys live in `extension/config.local.js` (gitignored, never committed).

## Run it
1. `chrome://extensions` -> Developer mode -> **Load unpacked** -> select `extension/`.
2. Open any normal website - your guardian appears bottom-right (keys are baked in, so
   it works immediately).
3. Click it and type or speak: "find me adidas flip flops", "do a dance",
   "play the brainrot game". Switch souls in the popup.
