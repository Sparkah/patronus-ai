// Patronus AI - background service worker.
// Talks to the partner APIs directly: Gemini (brain), SLNG (voice), Tavily (eyes),
// Mubit/Minima (picks the cheapest capable model, then we run it). Keys come from
// chrome.storage.local (popup) first, then baked-in config.local.js (gitignored).

let DEF = {};
try { importScripts("config.local.js"); DEF = self.__PATRONUS_DEFAULTS || {}; } catch (e) { /* no local defaults */ }

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const SLNG_TTS = "https://api.slng.ai/v1/bridges/unmute/tts/slng/deepgram/aura:2-en";
const TAVILY_SEARCH = "https://api.tavily.com/search";
const MINIMA_BASE = "https://api.minima.sh/v1";

// Where "I'm bored, launch a game" sends the user. Override via storage key GAMES.
const DEFAULT_GAMES = ["https://game-factory.tech", "https://tims-arcade.pages.dev"];

async function getCfg() {
  const d = await chrome.storage.local.get([
    "GEMINI_API_KEY", "GEMINI_MODEL", "SLNG_API_KEY", "TAVILY_API_KEY", "MUBIT_API_KEY", "GAMES", "muted"
  ]);
  return {
    geminiKey: d.GEMINI_API_KEY || DEF.GEMINI_API_KEY || "",
    geminiModel: d.GEMINI_MODEL || DEF.GEMINI_MODEL || "gemini-2.5-flash",
    slngKey: d.SLNG_API_KEY || DEF.SLNG_API_KEY || "",
    tavilyKey: d.TAVILY_API_KEY || DEF.TAVILY_API_KEY || "",
    mubitKey: d.MUBIT_API_KEY || DEF.MUBIT_API_KEY || "",
    games: (Array.isArray(d.GAMES) && d.GAMES.length) ? d.GAMES : DEFAULT_GAMES,
    muted: !!d.muted
  };
}

// fetch with a hard timeout (the SW can be torn down on a slow request)
async function fetchT(url, opts, ms = 12000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { ...opts, signal: ctrl.signal }); }
  finally { clearTimeout(t); }
}

// ---- Mubit / Minima: pick the cheapest capable model, then we run it ---------
async function minimaPick(taskText, taskType) {
  const cfg = await getCfg();
  if (!cfg.mubitKey) return null;
  try {
    const r = await fetchT(MINIMA_BASE + "/recommend", {
      method: "POST",
      headers: { "authorization": "Bearer " + cfg.mubitKey, "content-type": "application/json" },
      body: JSON.stringify({ task: { task: (taskText || "").slice(0, 300), task_type: taskType || "other" }, cost_quality_tradeoff: 3 })
    }, 6000);
    const j = await r.json();
    if (!r.ok) return null;
    // only pick models we can actually run with the Gemini key
    const runnable = m => m && m.provider === "google" && /^gemini-/.test(m.model_id || "");
    const m = runnable(j.recommended_model) ? j.recommended_model : (j.ranked || []).find(runnable);
    return { recommendationId: j.recommendation_id, modelId: m ? m.model_id : null, est: m ? m.est_cost_usd : (j.recommended_model && j.recommended_model.est_cost_usd) };
  } catch (e) { return null; }
}
async function minimaFeedback(recommendationId, modelId, usage) {
  const cfg = await getCfg();
  if (!cfg.mubitKey || !recommendationId) return;
  try {
    await fetchT(MINIMA_BASE + "/feedback", {
      method: "POST",
      headers: { "authorization": "Bearer " + cfg.mubitKey, "content-type": "application/json" },
      body: JSON.stringify({ recommendation_id: recommendationId, chosen_model_id: modelId, outcome: "success", input_tokens: (usage && usage.in) || 0, output_tokens: (usage && usage.out) || 0 })
    }, 5000);
  } catch (e) {}
}

// ---- Gemini: a soul-driven reply (model chosen by Minima) -------------------
async function callGemini(model, key, sys, message) {
  const url = `${GEMINI_BASE}/${model}:generateContent?key=${encodeURIComponent(key)}`;
  const r = await fetchT(url, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: sys }] },
      contents: [{ role: "user", parts: [{ text: message }] }],
      generationConfig: { temperature: 0.9, maxOutputTokens: 220 }
    })
  });
  const j = await r.json();
  if (!r.ok) return { ok: false, status: r.status, errMsg: (j && j.error && j.error.message) || ("http " + r.status) };
  const text = (j?.candidates?.[0]?.content?.parts || []).map(p => p.text).join("").trim() || "...";
  const u = j.usageMetadata || {};
  return { ok: true, text, usage: { in: u.promptTokenCount || 0, out: u.candidatesTokenCount || 0 } };
}

async function geminiReply({ soul, message, context, taskType }) {
  const cfg = await getCfg();
  if (!cfg.geminiKey) return { error: "no_gemini_key", text: "(Add a Gemini key so I can think.)" };
  const sys = (soul || "You are a friendly browser companion.") + (context ? `\n\n## Current page context (may help)\n${context.slice(0, 8000)}` : "");
  const pick = await minimaPick(message, taskType || "creative");
  let model = (pick && pick.modelId) || cfg.geminiModel;
  try {
    let res = await callGemini(model, cfg.geminiKey, sys, message);
    if (!res.ok && model !== cfg.geminiModel) { model = cfg.geminiModel; res = await callGemini(model, cfg.geminiKey, sys, message); } // fallback
    if (!res.ok) return { error: "gemini_" + (res.status || "x"), text: res.errMsg || "Gemini hiccup." };
    if (pick && pick.recommendationId) minimaFeedback(pick.recommendationId, model, res.usage); // fire and forget
    return { text: res.text, model, minima: pick ? model : null, est: pick ? pick.est : null };
  } catch (e) { return { error: "gemini_fetch", text: "(Couldn't reach Gemini.)" }; }
}

// ---- SLNG: text -> spoken audio (WAV) --------------------------------------
function abToBase64(buf) {
  const bytes = new Uint8Array(buf); let bin = ""; const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  return btoa(bin);
}
async function slngSpeak({ text, voice }) {
  const cfg = await getCfg();
  if (cfg.muted) return { skipped: "muted" };
  if (!cfg.slngKey) return { error: "no_slng_key" };
  try {
    const body = { text }; if (voice) body.voice = voice;
    const r = await fetchT(SLNG_TTS, {
      method: "POST",
      headers: { "Authorization": "Bearer " + cfg.slngKey, "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!r.ok) return { error: "slng_http_" + r.status };
    const buf = await r.arrayBuffer();
    return { audio: "data:audio/wav;base64," + abToBase64(buf) };
  } catch (e) { return { error: "slng_fetch" }; }
}

// ---- Tavily: research the whole web ----------------------------------------
async function tavilyResearch({ query }) {
  const cfg = await getCfg();
  if (!cfg.tavilyKey) return { error: "no_tavily_key" };
  try {
    const r = await fetchT(TAVILY_SEARCH, {
      method: "POST",
      headers: { "Authorization": "Bearer " + cfg.tavilyKey, "Content-Type": "application/json" },
      body: JSON.stringify({ query, max_results: 5, include_answer: "advanced", search_depth: "advanced" })
    });
    const j = await r.json();
    if (!r.ok) return { error: "tavily_http_" + r.status };
    return { answer: j.answer || "", results: (j.results || []).map(x => ({ title: x.title, url: x.url })) };
  } catch (e) { return { error: "tavily_fetch" }; }
}

async function openGame() {
  const cfg = await getCfg();
  const url = cfg.games[Math.floor(Math.random() * cfg.games.length)];
  await chrome.tabs.create({ url });
  return { opened: url };
}

async function openUrl({ url }) {
  if (!url || !/^https?:\/\//.test(url)) return { error: "bad_url" };
  await chrome.tabs.create({ url });
  return { opened: url };
}

// Open a site, then drive ITS OWN search box (explore-then-search) - works on
// stores whose URL search params we don't know (Harrods, Zara, ...).
async function siteSearch({ site, query }) {
  const url = /^https?:\/\//.test(site) ? site : "https://" + String(site || "").replace(/^\/+/, "");
  if (!/^https?:\/\/[^/]+\./.test(url)) return { error: "bad_site" };
  const tab = await chrome.tabs.create({ url });
  await new Promise(res => {
    const to = setTimeout(() => { try { chrome.tabs.onUpdated.removeListener(l); } catch (e) {} res(); }, 10000);
    function l(id, info) { if (id === tab.id && info.status === "complete") { clearTimeout(to); chrome.tabs.onUpdated.removeListener(l); res(); } }
    chrome.tabs.onUpdated.addListener(l);
  });
  try {
    const r = await chrome.scripting.executeScript({
      target: { tabId: tab.id }, args: [query],
      func: async (q) => {
        const sleep = ms => new Promise(r => setTimeout(r, ms));
        const find = () => {
          const els = [...document.querySelectorAll('input[type="search"], input[name="q"], input[name*="search" i], input[name*="term" i], input[placeholder*="search" i], input[aria-label*="search" i], input[id*="search" i]')];
          return els.find(e => e.offsetParent !== null) || els[0];
        };
        let inp = find();
        if (!inp || inp.offsetParent === null) {                 // search box hidden - reveal it
          const tog = [...document.querySelectorAll('button,[role="button"],a')].find(b =>
            /search/i.test((b.getAttribute('aria-label') || '') + ' ' + (b.className || '') + ' ' + (b.id || '')));
          if (tog) { tog.click(); await sleep(1000); inp = find(); }
        }
        if (!inp) return { ok: false };
        inp.focus();
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(inp, q);
        inp.dispatchEvent(new Event('input', { bubbles: true }));
        inp.dispatchEvent(new Event('change', { bubbles: true }));
        await sleep(250);
        const form = inp.closest('form');
        if (form) { form.requestSubmit ? form.requestSubmit() : form.submit(); return { ok: true, via: 'form' }; }
        ['keydown', 'keypress', 'keyup'].forEach(t =>
          inp.dispatchEvent(new KeyboardEvent(t, { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true })));
        return { ok: true, via: 'enter' };
      }
    });
    return { opened: url, searched: query, found: !!(r && r[0] && r[0].result && r[0].result.ok) };
  } catch (e) { return { opened: url, searched: query, found: false }; }
}

// ---- agentic router: turn "find flip flops on harrods" into a real action ----
async function routeIntent({ soul, message, name }) {
  const cfg = await getCfg();
  if (!cfg.geminiKey) return { action: "answer" };
  const sys =
    `You are the intent router for a browser guardian character${name ? " named " + name : ""}. ` +
    `Personality (for the spoken line only):\n${(soul || "").slice(0, 1000)}\n\n` +
    `Decide what the user wants. Reply ONLY with minified JSON: ` +
    `{"action":"site_search"|"navigate"|"answer","site":"","query":"","url":"","say":""}. Rules: ` +
    `- A NAMED online store/brand (Harrods, Zara, ASOS, Nike, eBay, etc.): action="site_search", ` +
    `site=its domain (e.g. "harrods.com"), query=the search terms. Do NOT guess its search URL. ` +
    `- Amazon: action="navigate", url="https://www.amazon.co.uk/s?k=QUERY" (url-encoded). ` +
    `- Videos: action="navigate", url="https://www.youtube.com/results?search_query=QUERY". ` +
    `- General facts/lookups: action="navigate", url="https://www.google.com/search?q=QUERY". ` +
    `- Just chatting: action="answer". ` +
    `"say" = ONE short in-character spoken line under 22 words about what you're doing.`;
  try {
    const r = await fetchT(`${GEMINI_BASE}/${cfg.geminiModel}:generateContent?key=${encodeURIComponent(cfg.geminiKey)}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: sys }] },
        contents: [{ role: "user", parts: [{ text: message }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 240, responseMimeType: "application/json" }
      })
    }, 9000);
    const j = await r.json();
    if (!r.ok) return { action: "answer" };
    let t = (j?.candidates?.[0]?.content?.parts || []).map(p => p.text).join("").trim().replace(/^```json/i, "").replace(/```$/, "").trim();
    const o = JSON.parse(t);
    if (o.action === "site_search" && o.site && o.query) return { action: "site_search", site: o.site, query: o.query, say: o.say || "On it!" };
    if (o.action === "navigate" && /^https?:\/\//.test(o.url || "")) return { action: "navigate", url: o.url, say: o.say || "On it!" };
    return { action: "answer", say: o.say || "" };
  } catch (e) { return { action: "answer" }; }
}

// ---- message router ---------------------------------------------------------
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      switch (msg && msg.type) {
        case "CHAT": sendResponse(await geminiReply({ soul: msg.soul, message: msg.message, context: msg.context, taskType: "creative" })); break;
        case "PAGE_QA": sendResponse(await geminiReply({ soul: msg.soul, message: msg.question, context: msg.text, taskType: "qa" })); break;
        case "SPEAK": sendResponse(await slngSpeak(msg)); break;
        case "RESEARCH": sendResponse(await tavilyResearch(msg)); break;
        case "OPEN_GAME": sendResponse(await openGame()); break;
        case "ACT": sendResponse(await routeIntent(msg)); break;
        case "OPEN_URL": sendResponse(await openUrl(msg)); break;
        case "SITE_SEARCH": sendResponse(await siteSearch(msg)); break;
        case "GET_POWERS": { const c = await getCfg(); sendResponse({ gemini: !!c.geminiKey, slng: !!c.slngKey, tavily: !!c.tavilyKey, mubit: !!c.mubitKey }); break; }
        default: sendResponse({ error: "unknown_message" });
      }
    } catch (e) { sendResponse({ error: "handler_crash", detail: String(e) }); }
  })();
  return true; // async
});
