# Patronus AI - submission (paste-ready)

Paste these into the Devpost / submission form when it opens (near the 19:00 deadline).

## Project name
Patronus AI

## Tagline (<= ~200 chars)
Pick a meme guardian that lives on every web page. It talks back in a real voice, drives store and web searches for you, suggests what fits, and plays games. Powered by Gemini, SLNG, Tavily and Mubit.

## Track
Open Innovation. Uses 4 partner techs live (exceeds the 3 required).

## Elevator pitch / What it does
Patronus AI is a Chrome extension that puts an animated meme "guardian" (surf-internet granny, Tung Tung, a wizard named Harry, a smug cat...) on every page you visit. It is not a sidebar chatbot - it is a creature on your screen that talks out loud and takes real actions:
- Say "find me adidas flip flops" and it walks to the site's own search bar, types it, lands on results, and recommends the specific products that fit you (with prices and reasons).
- "Research X" gives a grounded web answer with sources. "Summarize this page" reads the page.
- "Play the brainrot game" opens one of our own games in an in-browser overlay.
- "Do a dance" sends it zooming around the screen with confetti.
- Pick a different soul anytime; each has its own personality, voice and chat memory. Unlock a new one each day.

## How we built it
A Manifest V3 Chrome extension, no server required. A Shadow-DOM content script renders the character on every page (animation, voice playback, the in-page command panel, the visible search, and the game overlay). A background service worker is the agent core: it routes the user's intent with Gemini, runs the chosen action, and calls each partner API directly. Character art is generated with Imagen / gemini-3-pro-image and animated into looping sprites with Veo. Keys live in chrome.storage, never in the repo. Every partner call is recorded to an in-extension "sponsor usage log" with the real request and response, grouped by request.

## Sponsors - how each is load-bearing (visible in the in-app log)
- Gemini (Google DeepMind): intent routing, product reasoning, page Q&A; plus all character art (Imagen / gemini-3-pro-image) and Veo animations.
- SLNG: the voice - every reply spoken in-character; mic for voice input.
- Tavily: real web research with sources.
- Mubit / Minima: picks the cheapest capable model per call (shown live in each reply).
- Aikido: security scanning over the public repo.

## Challenges we ran into
Driving third-party sites visibly and reliably: search boxes are hidden behind toggles, blocked by cookie banners, and stores redirect (adidas.com -> adidas.co.uk) mid-action - so the agent dismisses cookies, reveals the search box, types, and survives redirects by retrying on the landed page. Getting genuine product recommendations meant scraping real product cards while skipping promo banners.

## Accomplishments we're proud of
A guardian that actually does things on the open web (not just chat), with every sponsor genuinely load-bearing and provable in a live usage log - one shopping query lights up Gemini + Mubit + SLNG at once, each with its real API call on screen.

## What we learned
Synthetic events don't always trigger modern site search; you need to drive the real UI and survive navigations. And making AI legible - showing the actual sponsor calls - is as compelling as the result.

## What's next
Superlinked semantic memory of what you've browsed, more guardians, richer per-product reasoning, and the Chrome Web Store.

## Built With (tags)
chrome-extension, manifest-v3, javascript, gemini, google-deepmind, gemini-3-pro-image, imagen, veo, slng, tavily, mubit, minima, web-speech-api, shadow-dom

## Try it out
- Repo: https://github.com/Sparkah/patronus-ai (public)
- Demo video: <paste Loom link>
- Run: load `extension/` unpacked in Chrome (keys baked in for the demo).
