# Patronus AI - demo run-of-show

A Chrome extension: pick a meme guardian that lives on every page, talks back in a
real voice, and does real tasks on the open web. Every beat lights up a sponsor.

## Pre-flight (before judges, ~1 min)
1. chrome://extensions -> reload Patronus AI. Open a normal website (not chrome://).
2. Practice query once: "find me cheapest flip flops" (warms the SIE cluster + cookies).
3. Popup -> 🧹 Reset for demo (clears chat + log so you start clean).
4. Mute toggle (🔊 in the panel header) if the room is loud.

## The run (~2 min)
1. Hook (10s): "Pick a guardian, it lives on every page." Open popup, show the souls +
   the locked "coming soon" tile, pick Surf Granny -> she appears, animated, greets out
   loud.  (SLNG voice, Gemini/Veo art)
2. Agentic moment (30s, LEAD): click the mic and SAY "find me the cheapest flip flops."
   She opens Amazon, walks to the search bar, types, lands on results, recommends the
   cheapest with links. Reply tag: site search - Superlinked semantic rank - Gemini -
   Mubit - SLNG.  (four sponsors, one action). Frame: "hands-free, never leave my page."
3. Research (15s): "research the best flip-flop brands" -> grounded answer + sources. (Tavily)
4. Fun (20s): switch to Six Seven, say "spin the spinner" -> a real fidget spinner
   pops up that you flick/drag (physics spin-down + live RPM counter + confetti).
   Then "do a dance" -> flies around. (creativity; the judge's fidget-spinner idea)
5. Game (15s): "play the brainrot game" -> brainrot_2048 in the in-browser overlay. (your factory)
6. The receipts (20s, closer): popup -> 📊 Sponsor log (pony page). Open the
   "find flip flops" group -> Superlinked + Mubit + Gemini + SLNG, each with the real
   API call. "Every sponsor, genuinely used - here are the receipts."
7. Close: "Gemini thinks, SLNG speaks, Tavily searches, Mubit keeps it cheap, Superlinked
   ranks on open models - and a new soul every day."

## Each sponsor's moment
- Gemini (Google DeepMind): the brain - routing, product reasoning, art/animation (beats 1-5).
- SLNG: speaks every reply + voice input via the mic (beats 1, 2, 4).
- Tavily: the research beat (3).
- Mubit / Minima: the model pick, in the shopping reply + the log (2, 6).
- Superlinked (SIE): semantic product ranking via open embeddings, in the tag + the log (2, 6).
- Aikido: repo security scan - not in this log; show the scan report on its own.

## Reliability
- Shopping takes ~10-15s (cookies, redirect, search) - narrate "watch her drive the bar."
- If SIE is cold the suggestion still works (falls back to Gemini), so you're never stuck.
- Demo on a normal site; reset the log between the practice run and the real run.

## Track
Open Innovation. 4 partner techs live (Gemini, SLNG, Tavily, Mubit) + Superlinked via SIE.
