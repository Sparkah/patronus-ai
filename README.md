# 🪄 Patronus AI

**Pick your guardian. It lives in your browser, reacts, talks back in a real voice,
researches the web for you, and launches games when you're bored. Unlock one new
soul a day.**

Built at the {Tech: Europe} London AI Hackathon. Open Innovation track.

A Patronus is a tiny animated character (a cat, a dog, or a surf-internet grandma)
that overlays onto every page you visit. It is not a chatbot in a sidebar - it is a
*creature on your screen*. It bobs, naps when you idle, surfs across the page, and
when you talk to it, it answers out loud, in character.

## Why it's more than a mascot

Each character has a **soul** (`extension/souls/<name>.md`) - a personality persona
that drives both what it says (Gemini) and how it sounds (SLNG voice). Surf Granny
roasts slow websites. Mochi the cat helps you while pretending it's beneath her.
You **unlock one soul per day**, so there's a reason to come back tomorrow.

## The partner stack (every one is load-bearing, not bolted on)

Each partner technology is one of the Patronus's *powers*:

- **Gemini (Google DeepMind)** - the brain. Soul-driven chat, "what's on this page?"
  answers, and (build-time) Imagen/Veo for the character art.
- **SLNG** - the voice. Replies are spoken aloud via SLNG TTS, a different voice per
  character. Granny actually sounds like granny.
- **Tavily** - the eyes. "Research the whole web" grounds answers in real sources.
- **Mubit / Minima** - the metabolism. Routes each request to the cheapest model that
  clears the quality bar, so your guardian "eats cheap." *(wiring in progress)*
- **n8n** - the instincts. Background "watch this page and ping me" autopilot. *(planned)*
- **Superlinked** - the memory. Semantic recall of what you've browsed. *(planned)*
- **Aikido** - security scanning over this very repo.

If a key is missing, the feature degrades honestly (voice falls back to the browser's
built-in speech synthesis, etc.) - nothing is faked in the UI.

## Architecture

A Manifest V3 Chrome extension, no server required:

- `extension/content.js` - injects the character into every page via **Shadow DOM**
  (so no site's CSS can break it). Idle/nap/wander/surf animation, draggable, an
  in-page command panel (Talk / This page / Web / Bored), and voice playback.
- `extension/background.js` - the service worker. Calls Gemini, SLNG, and Tavily
  **directly**. API keys live in `chrome.storage.local` (pasted in the popup) and are
  **never** committed.
- `extension/popup.html/js` - your soul collection, the daily unlock, key settings.
- `extension/souls/*.md` - the personalities.
- `dashboard/` + `refinery.py` (optional) - a second surface: a multi-agent research
  swarm (Gemini + Tavily) with live telemetry, reusable for the "whole web" power.

## Run it

1. Open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, and
   select the `extension/` folder.
2. Open any normal website - your Patronus appears bottom-right.
3. Click the extension icon -> **Connect powers** -> paste your Gemini / SLNG / Tavily
   keys (it works with the browser's built-in voice even before you add SLNG).
4. Click your guardian to talk to it. Come back tomorrow to unlock the next soul.

## What's next

Close the loop: Minima cost-routing on every call, n8n background watchers, Superlinked
browsing memory, character art via Imagen/Veo, and shipping to the Chrome Web Store.
