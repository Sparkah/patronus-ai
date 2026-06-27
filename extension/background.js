// Patronus AI - background service worker.
// Talks to the partner APIs directly (Gemini brain, SLNG voice, Tavily eyes).
// Keys live in chrome.storage.local (pasted in the popup), never in the repo.

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const SLNG_TTS = "https://api.slng.ai/v1/bridges/unmute/tts/slng/deepgram/aura:2-en";
const TAVILY_SEARCH = "https://api.tavily.com/search";

// Where "I'm bored, launch a game" sends the user. Edit / override via storage key GAMES.
const DEFAULT_GAMES = [
  "https://game-factory.tech",
  "https://tims-arcade.pages.dev"
];

async function getCfg() {
  const d = await chrome.storage.local.get([
    "GEMINI_API_KEY", "GEMINI_MODEL", "SLNG_API_KEY", "TAVILY_API_KEY", "GAMES", "muted"
  ]);
  return {
    geminiKey: d.GEMINI_API_KEY || "",
    geminiModel: d.GEMINI_MODEL || "gemini-2.5-flash",
    slngKey: d.SLNG_API_KEY || "",
    tavilyKey: d.TAVILY_API_KEY || "",
    games: (Array.isArray(d.GAMES) && d.GAMES.length) ? d.GAMES : DEFAULT_GAMES,
    muted: !!d.muted
  };
}

// ---- Gemini: a soul-driven reply -------------------------------------------
async function geminiReply({ soul, message, context }) {
  const cfg = await getCfg();
  if (!cfg.geminiKey) return { error: "no_gemini_key", text: "(Add a Gemini key in the popup so I can think.)" };
  const sys = (soul || "You are a friendly browser companion.") +
    (context ? `\n\n## Current page context (may help)\n${context.slice(0, 8000)}` : "");
  const url = `${GEMINI_BASE}/${cfg.geminiModel}:generateContent?key=${encodeURIComponent(cfg.geminiKey)}`;
  try {
    const r = await fetch(url, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: sys }] },
        contents: [{ role: "user", parts: [{ text: message }] }],
        generationConfig: { temperature: 0.9, maxOutputTokens: 220 }
      })
    });
    const j = await r.json();
    if (!r.ok) return { error: "gemini_http_" + r.status, text: j?.error?.message || "Gemini hiccup." };
    const text = j?.candidates?.[0]?.content?.parts?.map(p => p.text).join("") || "...";
    return { text: text.trim() };
  } catch (e) {
    return { error: "gemini_fetch", text: "(Couldn't reach Gemini.)" };
  }
}

// ---- SLNG: text -> spoken audio (WAV) --------------------------------------
function abToBase64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}
async function slngSpeak({ text, voice }) {
  const cfg = await getCfg();
  if (cfg.muted) return { skipped: "muted" };
  if (!cfg.slngKey) return { error: "no_slng_key" };
  try {
    const body = { text };
    if (voice) body.voice = voice;
    const r = await fetch(SLNG_TTS, {
      method: "POST",
      headers: { "Authorization": "Bearer " + cfg.slngKey, "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!r.ok) return { error: "slng_http_" + r.status };
    const buf = await r.arrayBuffer();
    return { audio: "data:audio/wav;base64," + abToBase64(buf) };
  } catch (e) {
    return { error: "slng_fetch" };
  }
}

// ---- Tavily: research the whole web ----------------------------------------
async function tavilyResearch({ query }) {
  const cfg = await getCfg();
  if (!cfg.tavilyKey) return { error: "no_tavily_key" };
  try {
    const r = await fetch(TAVILY_SEARCH, {
      method: "POST",
      headers: { "Authorization": "Bearer " + cfg.tavilyKey, "Content-Type": "application/json" },
      body: JSON.stringify({ query, max_results: 5, include_answer: "advanced", search_depth: "advanced" })
    });
    const j = await r.json();
    if (!r.ok) return { error: "tavily_http_" + r.status };
    return { answer: j.answer || "", results: (j.results || []).map(x => ({ title: x.title, url: x.url })) };
  } catch (e) {
    return { error: "tavily_fetch" };
  }
}

async function openGame() {
  const cfg = await getCfg();
  const url = cfg.games[Math.floor(Math.random() * cfg.games.length)];
  await chrome.tabs.create({ url });
  return { opened: url };
}

// ---- message router ---------------------------------------------------------
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      switch (msg && msg.type) {
        case "CHAT": sendResponse(await geminiReply(msg)); break;
        case "PAGE_QA": sendResponse(await geminiReply({ soul: msg.soul, message: msg.question, context: msg.text })); break;
        case "SPEAK": sendResponse(await slngSpeak(msg)); break;
        case "RESEARCH": sendResponse(await tavilyResearch(msg)); break;
        case "OPEN_GAME": sendResponse(await openGame()); break;
        default: sendResponse({ error: "unknown_message" });
      }
    } catch (e) { sendResponse({ error: "handler_crash", detail: String(e) }); }
  })();
  return true; // async
});
