// Patronus AI - content script. Injects your guardian onto every page.
// Shadow DOM keeps the page's CSS from ever touching it.
(function () {
  if (window.__patronusLoaded) return;
  window.__patronusLoaded = true;

  // ---- character registry (visuals + voice). Personalities live in souls/*.md ----
  const CHARS = {
    cat:     { name: "Mochi",       emoji: "🐱", accent: "#ff9bb3", voice: "aura-2-thalia-en",
               quips: ["mrrp. this page is... fine, i guess.", "i closed a tab. you didn't need it.", "ask me something, servant.", "i was napping on your RAM."] },
    dog:     { name: "Biscuit",     emoji: "🐶", accent: "#ffce7a", voice: "aura-2-orion-en",
               quips: ["this is the BEST website EVER!", "did you say fetch?? i can fetch the WEB!", "you're doing amazing!!", "squirrel-- wait. focus. hi!"] },
    grandma: { name: "Surf Granny", emoji: "👵", board: "🏄", accent: "#8ecbff", voice: "aura-2-theia-en",
               quips: ["cowabunga, sweetie.", "back in my day, pages LOADED slow.", "let granny google that for ya.", "hold my knitting, i'm surfing."] },
    tungtung: { name: "Tung Tung", emoji: "🪵", accent: "#c79a5b", voice: "aura-2-orion-en",
               quips: ["tung tung tung tung TUNG!", "i bonk bad websites.", "sahur! up we go.", "bonk. problem solved."] },
    sixseven: { name: "Six Seven", emoji: "✋", accent: "#7fc7f5", voice: "aura-2-thalia-en",
               quips: ["six... seveeen!", "is it 6 or 7? yes.", "ayy, six seven kiddo.", "not 5, not 8. six seven."] },
    pupa:    { name: "Pupa",        emoji: "🐛", accent: "#9be08a", voice: "aura-2-luna-en",
               quips: ["metamorphosis: 73% complete.", "one day i'll be a butterfly API.", "breathe. you're becoming something.", "small steps. tiny legs."] },
    skibidi: { name: "Skibidi",     emoji: "🚽", accent: "#bcccdc", voice: "aura-2-orion-en",
               quips: ["skibidi dop dop yes yes.", "flush. brb.", "still booting up...", "coming soon, kinda."] }
  };
  const DEFAULT_CHAR = "grandma";

  let charId = DEFAULT_CHAR;
  let muted = false;
  let mode = "talk";          // talk | page | web
  let soulCache = {};
  let bubbleTimer = null, idleTimer = null, wanderTimer = null;

  // ---- shadow host ----------------------------------------------------------
  const host = document.createElement("div");
  host.id = "patronus-host";
  host.style.cssText = "position:fixed;inset:0;z-index:2147483646;pointer-events:none;";
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `
    <style>
      .pet{position:fixed;right:26px;bottom:26px;width:84px;height:84px;cursor:grab;
        pointer-events:auto;user-select:none;display:flex;align-items:center;justify-content:center;
        font-size:60px;line-height:1;filter:drop-shadow(0 8px 14px rgba(0,0,0,.28));
        animation:bob 2.6s ease-in-out infinite alternate;transition:transform .15s;z-index:3;}
      .pet:active{cursor:grabbing}
      .pet img{width:100%;height:100%;object-fit:contain;display:none;-webkit-user-drag:none;pointer-events:none}
      .pet video{width:100%;height:100%;object-fit:cover;border-radius:16px;display:none;pointer-events:none}
      .pet.hasimg #emoji{display:none}
      .pet.hasimg img{display:block}
      .pet.hasvid #emoji,.pet.hasvid img{display:none}
      .pet.hasvid video{display:block}
      @keyframes bob{to{transform:translateY(-8px)}}
      .pet.nap{animation:none;transform:rotate(8deg) scale(.92);filter:drop-shadow(0 4px 8px rgba(0,0,0,.2)) grayscale(.2)}
      .zzz{position:fixed;font-size:18px;opacity:0;pointer-events:none;color:#7c8aa0;font-weight:800;z-index:3}
      .pet.dash{animation:none}
      .bubble{position:fixed;max-width:240px;background:#fff;color:#1b2330;border:1px solid #e7eaf0;
        padding:9px 13px;border-radius:14px 14px 14px 5px;font:600 13.5px/1.45 -apple-system,system-ui,Segoe UI,Roboto,sans-serif;
        box-shadow:0 10px 26px rgba(20,30,55,.18);pointer-events:none;opacity:0;transform:translateY(6px);
        transition:opacity .2s,transform .2s;z-index:4;}
      .bubble.show{opacity:1;transform:none}
      .bubble .nm{display:block;font-size:10px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:var(--ac);margin-bottom:2px}
      .panel{position:fixed;right:26px;bottom:120px;width:300px;background:#f7f8fb;border:1px solid #e7eaf0;
        border-radius:16px;box-shadow:0 18px 44px rgba(20,30,55,.24);pointer-events:auto;z-index:5;overflow:hidden;
        display:none;font:13px/1.5 -apple-system,system-ui,Segoe UI,Roboto,sans-serif;color:#1b2330}
      .panel.open{display:block;animation:rise .2s both}
      @keyframes rise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
      .phead{display:flex;align-items:center;gap:8px;padding:10px 12px;background:#fff;border-bottom:1px solid #eef1f6}
      .phead .av{font-size:22px}.phead b{font-size:13px}.phead .x{margin-left:auto;cursor:pointer;color:#9aa4b4;font-weight:800}
      .chips{display:flex;gap:6px;flex-wrap:wrap;padding:10px 12px 4px}
      .chip{border:1.5px solid #e2e6ee;background:#fff;border-radius:999px;padding:6px 10px;font-size:11.5px;font-weight:700;cursor:pointer;color:#3a4256}
      .chip.on{border-color:var(--ac);background:#fff;color:var(--ac)}
      .ask{display:flex;gap:6px;padding:8px 12px 12px}
      .ask input{flex:1;border:1px solid #e2e6ee;border-radius:10px;padding:9px 11px;font-size:13px;outline:none}
      .ask input:focus{border-color:var(--ac)}
      .ask .go{border:none;border-radius:10px;background:var(--ac);color:#fff;font-size:15px;width:38px;cursor:pointer}
      .out{padding:0 12px 12px;max-height:230px;overflow:auto}
      .ans{background:#fff;border:1px solid #eef1f6;border-radius:12px;padding:10px 12px;font-size:13px;color:#2c3647}
      .lk{display:block;margin-top:6px;color:var(--ac);font-size:12px;font-weight:600;text-decoration:none;
        border:1px solid #eef1f6;border-radius:9px;padding:7px 10px;background:#fff}
      .muted{color:#94a0b2;font-size:12px}
    </style>
    <div class="pet" id="pet"><video id="petvid" muted loop autoplay playsinline></video><img id="petimg" alt="" draggable="false"><span id="emoji">👵</span></div>
    <div class="bubble" id="bubble"></div>
    <div class="panel" id="panel">
      <div class="phead"><span class="av" id="pav">👵</span><b id="pnm">Surf Granny</b><span class="x" id="px">✕</span></div>
      <div class="chips">
        <span class="chip" data-m="talk">💬 Talk</span>
        <span class="chip" data-m="page">👀 This page</span>
        <span class="chip" data-m="web">🌐 Web</span>
        <span class="chip" id="cbored">🎮 I'm bored</span>
        <span class="chip" id="cmute">🔊</span>
      </div>
      <div class="ask"><input id="inp" placeholder="find or do anything..."><button class="go" id="go">↑</button></div>
      <div class="out" id="out"></div>
    </div>`;
  (document.documentElement || document.body).appendChild(host);

  const $ = id => root.getElementById(id);
  const pet = $("pet"), emojiEl = $("emoji"), petimg = $("petimg"), petvid = $("petvid"), bubble = $("bubble");
  const panel = $("panel"), out = $("out"), inp = $("inp");

  // ---- helpers --------------------------------------------------------------
  const send = msg => new Promise(res => { try { chrome.runtime.sendMessage(msg, res); } catch (e) { res({ error: "no_bg" }); } });
  const esc = s => (s || "").replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  const cur = () => CHARS[charId] || CHARS[DEFAULT_CHAR];

  function applyChar() {
    const c = cur();
    host.style.setProperty("--ac", c.accent);
    [pet, panel, bubble].forEach(el => el.style.setProperty("--ac", c.accent));
    emojiEl.textContent = c.emoji;            // last-resort fallback
    pet.classList.remove("hasimg", "hasvid");
    petimg.onload = () => { if (!pet.classList.contains("hasvid")) pet.classList.add("hasimg"); };
    petimg.onerror = () => pet.classList.remove("hasimg");
    try { petimg.src = chrome.runtime.getURL("chars/" + charId + ".png"); } catch (e) {}
    petvid.onloadeddata = () => { pet.classList.add("hasvid"); petvid.play().catch(() => {}); };
    petvid.onerror = () => pet.classList.remove("hasvid");
    try { petvid.src = chrome.runtime.getURL("chars/" + charId + ".mp4"); petvid.load(); } catch (e) {}
    $("pav").textContent = c.emoji; $("pnm").textContent = c.name;
  }

  function positionNear() {
    const r = pet.getBoundingClientRect();
    bubble.style.left = Math.max(10, r.left - 170) + "px";
    bubble.style.top = Math.max(10, r.top - 16) + "px";
  }

  async function getSoul() {
    if (soulCache[charId]) return soulCache[charId];
    try {
      const r = await fetch(chrome.runtime.getURL(`souls/${charId}.md`));
      const t = await r.text();
      soulCache[charId] = t; return t;
    } catch (e) { return `You are ${cur().name}, a friendly browser guardian.`; }
  }

  // show text in the bubble and speak it aloud (SLNG, with a browser fallback)
  async function say(text, { speak = true } = {}) {
    if (!text) return;
    positionNear();
    bubble.innerHTML = `<span class="nm">${esc(cur().name)}</span>${esc(text)}`;
    bubble.classList.add("show");
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(() => bubble.classList.remove("show"), Math.min(9000, 2600 + text.length * 45));
    if (speak && !muted) voice(text);
  }

  let audio = null;
  async function voice(text) {
    const r = await send({ type: "SPEAK", text: text.slice(0, 300), voice: cur().voice });
    if (r && r.audio) {
      try { if (audio) audio.pause(); audio = new Audio(r.audio); audio.play().catch(() => browserVoice(text)); return; }
      catch (e) {}
    }
    browserVoice(text); // fallback: Web Speech (works with no SLNG key)
  }
  function browserVoice(text) {
    try {
      if (!window.speechSynthesis) return;
      const u = new SpeechSynthesisUtterance(text);
      const map = { grandma: { rate: .9, pitch: .8 }, cat: { rate: 1.05, pitch: 1.5 }, dog: { rate: 1.25, pitch: 1.3 }, pupa: { rate: .95, pitch: 1.1 } };
      Object.assign(u, map[charId] || {});
      speechSynthesis.cancel(); speechSynthesis.speak(u);
    } catch (e) {}
  }

  // ---- behaviors: idle nap, periodic wander/special move --------------------
  function resetIdle() {
    pet.classList.remove("nap");
    pet.style.animation = "";
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => { pet.classList.add("nap"); puff("💤"); }, 45000);
  }
  function puff(txt) {
    const r = pet.getBoundingClientRect();
    const z = document.createElement("div"); z.className = "zzz"; z.textContent = txt;
    z.style.left = (r.right - 18) + "px"; z.style.top = (r.top - 6) + "px";
    root.appendChild(z);
    z.animate([{ opacity: 0, transform: "translateY(0)" }, { opacity: 1, offset: .3 }, { opacity: 0, transform: "translateY(-34px)" }],
      { duration: 1800, easing: "ease-out" }).onfinish = () => z.remove();
  }
  function specialMove() {
    if (panel.classList.contains("open")) return scheduleWander();
    const c = cur();
    if (c.board) pet.classList.add("surf");
    const vw = window.innerWidth;
    const startRight = parseFloat(getComputedStyle(pet).right) || 26;
    pet.style.transition = "transform 2.4s cubic-bezier(.4,0,.4,1)";
    pet.style.transform = `translateX(${-(vw - 220)}px)`;
    setTimeout(() => { pet.style.transform = "translateX(0)"; }, 2600);
    setTimeout(() => { pet.classList.remove("surf"); pet.style.transition = ""; scheduleWander(); }, 5400);
    if (Math.random() < .6) say(c.quips[Math.floor(Math.random() * c.quips.length)], { speak: false });
  }
  function scheduleWander() {
    clearTimeout(wanderTimer);
    wanderTimer = setTimeout(specialMove, 22000 + Math.random() * 25000);
  }

  // ---- interaction ----------------------------------------------------------
  function togglePanel(open) {
    panel.classList.toggle("open", open ?? !panel.classList.contains("open"));
    if (panel.classList.contains("open")) { resetIdle(); inp.focus(); }
  }
  pet.addEventListener("click", e => { if (!dragMoved) togglePanel(); });
  $("px").addEventListener("click", () => togglePanel(false));

  root.querySelectorAll(".chip[data-m]").forEach(ch => ch.addEventListener("click", () => {
    mode = ch.dataset.m;
    root.querySelectorAll(".chip[data-m]").forEach(x => x.classList.toggle("on", x === ch));
    inp.placeholder = mode === "page" ? "ask about this page..." : mode === "web" ? "research the whole web..." : "find or do anything...";
    inp.focus();
  }));
  $("cbored").addEventListener("click", async () => { say(pick(["let's PLAY!", "screen break, kiddo!", "you've earned a game."]), {}); await send({ type: "OPEN_GAME" }); });
  $("cmute").addEventListener("click", () => { muted = !muted; chrome.storage.local.set({ muted }); $("cmute").textContent = muted ? "🔇" : "🔊"; });

  $("go").addEventListener("click", submit);
  inp.addEventListener("keydown", e => { if (e.key === "Enter") submit(); });
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const minimaTag = r => r && r.minima ? `<div class="muted" style="margin-top:6px">🧠 Mubit/Minima picked ${esc(r.minima)}${r.est ? " · ~$" + Number(r.est).toFixed(4) + "/call" : ""}</div>` : "";

  async function submit() {
    const q = inp.value.trim(); if (!q) return;
    inp.value = ""; resetIdle();
    const soul = await getSoul();
    out.innerHTML = `<div class="muted">${esc(cur().name)} is thinking...</div>`;
    say("hmm...", { speak: false });
    if (mode === "web") {
      const r = await send({ type: "RESEARCH", query: q });
      if (r.error) return fail(r.error);
      const links = (r.results || []).map(x => `<a class="lk" href="${x.url}" target="_blank" rel="noopener">${esc(x.title || x.url)} ↗</a>`).join("");
      out.innerHTML = `<div class="ans">${esc(r.answer || "Here's what I found.")}</div>${links}`;
      summarizeAloud(soul, `Web research on "${q}". Findings: ${r.answer}`);
    } else if (mode === "page") {
      const text = document.body ? document.body.innerText.slice(0, 14000) : "";
      const r = await send({ type: "PAGE_QA", soul, question: q, text });
      if (r.error && !r.text) return fail(r.error);
      out.innerHTML = `<div class="ans">${esc(r.text)}</div>` + minimaTag(r);
      say(r.text);
    } else {
      // Talk = agentic: actually DO it (find/open/navigate), else fall back to chat
      const route = await send({ type: "ACT", soul, message: q, name: cur().name });
      if (route && route.action === "site_search" && route.site) {
        out.innerHTML = `<div class="ans">${esc(route.say || "On it!")}</div>` +
          `<div class="muted" style="margin-top:6px">exploring ${esc(route.site)}, searching "${esc(route.query)}"…</div>`;
        say(route.say || "On it, sweetie!");
        await send({ type: "SITE_SEARCH", site: route.site, query: route.query });
      } else if (route && route.action === "navigate" && route.url) {
        out.innerHTML = `<div class="ans">${esc(route.say || "On it!")}</div>` +
          `<a class="lk" href="${route.url}" target="_blank" rel="noopener">${esc(route.url)} ↗</a>`;
        say(route.say || "On it, sweetie!");
        await send({ type: "OPEN_URL", url: route.url });
      } else {
        const r = await send({ type: "CHAT", soul, message: q, context: document.title });
        if (r.error && !r.text) return fail(r.error);
        out.innerHTML = `<div class="ans">${esc(r.text)}</div>` + minimaTag(r);
        say(r.text);
      }
    }
  }
  async function summarizeAloud(soul, material) {
    const r = await send({ type: "CHAT", soul, message: "In one short spoken sentence, tell me what you found: " + material });
    if (r && r.text) say(r.text);
  }
  function fail(code) {
    const hint = { no_gemini_key: "Add a Gemini key in the popup and I'll wake up.", no_tavily_key: "Add a Tavily key in the popup so I can surf the web.", no_bg: "Reload the extension." }[code] || "Something hiccuped.";
    out.innerHTML = `<div class="muted">${esc(hint)}</div>`; say(hint, { speak: false });
  }

  // ---- drag -----------------------------------------------------------------
  let dragging = false, dragMoved = false, sx, sy, ox, oy;
  pet.addEventListener("pointerdown", e => {
    dragging = true; dragMoved = false; sx = e.clientX; sy = e.clientY;
    const r = pet.getBoundingClientRect(); ox = r.left; oy = r.top; pet.setPointerCapture(e.pointerId);
  });
  pet.addEventListener("pointermove", e => {
    if (!dragging) return;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (Math.abs(dx) + Math.abs(dy) > 5) dragMoved = true;
    pet.style.right = "auto"; pet.style.bottom = "auto";
    pet.style.left = (ox + dx) + "px"; pet.style.top = (oy + dy) + "px";
  });
  pet.addEventListener("pointerup", () => { dragging = false; resetIdle(); });

  // ---- boot -----------------------------------------------------------------
  chrome.storage.local.get(["activeChar", "muted"], d => {
    if (d.activeChar && CHARS[d.activeChar]) charId = d.activeChar;
    muted = !!d.muted; $("cmute").textContent = muted ? "🔇" : "🔊";
    applyChar();
    setTimeout(() => say(pick(cur().quips)), 1200);
    resetIdle(); scheduleWander();
  });
  chrome.storage.onChanged.addListener(ch => {
    if (ch.activeChar && CHARS[ch.activeChar.newValue]) { charId = ch.activeChar.newValue; applyChar(); say(pick(cur().quips)); }
    if (ch.muted) { muted = !!ch.muted.newValue; $("cmute").textContent = muted ? "🔇" : "🔊"; }
  });
})();
