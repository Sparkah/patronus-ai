# Patronus AI - 90-second demo script

One Chrome extension: pick a meme "guardian" that lives on every page, talks back in a
real voice, and actually does things. Every beat lights up a different sponsor.

## Setup (off camera)
- Load `extension/` unpacked in Chrome (keys are baked into `config.local.js`).
- Have a normal site open (any), and the popup pinned.

## The run
1. **Pick a guardian.** Open the popup -> show the roster + the locked "coming soon"
   tile (daily-unlock retention). Pick **Surf Granny**. She appears on the page,
   animated, and greets you out loud.  *(Gemini art + Veo animation, SLNG voice)*
2. **Shop, hands-free - the hero beat.** Click the mic and SAY
   *"find me adidas flip flops."* She walks to Adidas's own search bar, types it,
   lands on results, and recommends specific pairs with reasons, tagged
   `site search - Gemini - Mubit - SLNG voice`.  *(whole stack, one real action)*
3. **Research.** *"what do reviews say about Adilette slides?"* -> live answer + sources. *(Tavily)*
4. **Switch souls.** Pick **Tung Tung** -> fresh chat, new personality + voice. *(per-character memory)*
5. **Go wild.** *"do a dance"* / *"fly around"* -> she zooms the screen with confetti. *(wow factor)*
6. **Play your game.** *"play the brainrot game"* -> `brainrot_2048` opens in an
   in-browser overlay, playable inline. *(ties in the game factory)*
7. **Close.** "One guardian: Gemini thinks, SLNG speaks, Tavily searches, Mubit keeps
   it cheap - and a new soul every day so you come back."

## Sponsor map (each judge sees their tech)
- **Gemini (Google DeepMind)** - reasoning, intent routing, product picks; character art + Veo.
- **SLNG** - every spoken reply, plus voice input.
- **Tavily** - the research beat (real web search + sources).
- **Mubit / Minima** - picks the cheapest capable model per call (shown in the reply tag).
- **Aikido** - repo security scan (connect the GitHub repo, screenshot the report).
- **Superlinked** - semantic memory (optional; "coming soon" until the cluster URL is set).

## Track
Open Innovation. Uses 4 partner techs live (Gemini, SLNG, Tavily, Mubit) - exceeds the 3 required.

## Judging fit
Technical: a real MV3 agent that drives third-party sites visibly. Creativity: meme
guardians with souls + voices. Real problem: hands-free shopping/answers from any page.
