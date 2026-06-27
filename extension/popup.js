// Patronus AI popup: your collection, the daily soul unlock, and key settings.
const ROSTER = [
  { id: "grandma", e: "👵", n: "Surf Granny" },
  { id: "cat",     e: "🐱", n: "Mochi" },
  { id: "dog",     e: "🐶", n: "Biscuit" },
  { id: "pupa",    e: "🐛", n: "Pupa" }
];
const $ = id => document.getElementById(id);
const todayStr = () => new Date().toISOString().slice(0, 10);

let S = { unlocked: ["grandma"], activeChar: "grandma", lastUnlock: "", streak: 0 };

function load() {
  chrome.storage.local.get(["unlocked", "activeChar", "lastUnlock", "streak", "GEMINI_API_KEY", "SLNG_API_KEY", "TAVILY_API_KEY"], d => {
    S.unlocked = Array.isArray(d.unlocked) && d.unlocked.length ? d.unlocked : ["grandma"];
    S.activeChar = d.activeChar && S.unlocked.includes(d.activeChar) ? d.activeChar : S.unlocked[0];
    S.lastUnlock = d.lastUnlock || "";
    S.streak = d.streak || 0;
    if (d.GEMINI_API_KEY) $("k_gem").value = d.GEMINI_API_KEY;
    if (d.SLNG_API_KEY) $("k_slng").value = d.SLNG_API_KEY;
    if (d.TAVILY_API_KEY) $("k_tav").value = d.TAVILY_API_KEY;
    persist(); render();
  });
}
function persist() { chrome.storage.local.set({ unlocked: S.unlocked, activeChar: S.activeChar, lastUnlock: S.lastUnlock, streak: S.streak }); }

function setActive(id) { if (!S.unlocked.includes(id)) return; S.activeChar = id; persist(); render(); }

function nextLocked() { return ROSTER.find(c => !S.unlocked.includes(c.id)); }
function eligibleToday() { return !!nextLocked() && S.lastUnlock !== todayStr(); }

function doUnlock() {
  const nx = nextLocked(); if (!nx || !eligibleToday()) return;
  S.unlocked.push(nx.id);
  S.streak = (S.lastUnlock && daysBetween(S.lastUnlock, todayStr()) === 1) ? S.streak + 1 : 1;
  S.lastUnlock = todayStr();
  S.activeChar = nx.id;            // meet the new soul immediately (content script greets via storage change)
  persist(); render();
}
function daysBetween(a, b) { return Math.round((new Date(b) - new Date(a)) / 86400000); }

function render() {
  const active = ROSTER.find(c => c.id === S.activeChar) || ROSTER[0];
  $("heroE").textContent = active.e; $("heroN").textContent = active.n;
  $("streak").textContent = S.streak > 1 ? `🔥 ${S.streak}-day streak` : "";

  $("grid").innerHTML = ROSTER.map(c => {
    const unlocked = S.unlocked.includes(c.id);
    const cls = "tile" + (c.id === S.activeChar ? " active" : "") + (unlocked ? "" : " locked");
    return `<div class="${cls}" data-id="${c.id}"><div class="e">${c.e}</div><div class="t">${unlocked ? c.n : "???"}</div></div>`;
  }).join("");
  document.querySelectorAll(".tile").forEach(t => t.addEventListener("click", () => setActive(t.dataset.id)));

  const box = $("unlockBox");
  if (eligibleToday()) {
    box.innerHTML = `<div class="unlock go" id="ub"><b>✨ A new soul is waiting</b><small>Tap to unlock today's character</small></div>`;
    $("ub").addEventListener("click", doUnlock);
  } else if (nextLocked()) {
    box.innerHTML = `<div class="unlock wait">⏳ Next soul unlocks tomorrow - come back to test it.</div>`;
  } else {
    box.innerHTML = `<div class="unlock wait">🏆 You've awakened every soul. Legend.</div>`;
  }
}

$("save").addEventListener("click", () => {
  chrome.storage.local.set({
    GEMINI_API_KEY: $("k_gem").value.trim(),
    SLNG_API_KEY: $("k_slng").value.trim(),
    TAVILY_API_KEY: $("k_tav").value.trim()
  }, () => { $("saved").textContent = "Saved ✓"; setTimeout(() => $("saved").textContent = "", 1800); });
});

// demo/testing helper: shift-click the wand to awaken every soul at once
document.querySelector(".logo").addEventListener("click", e => {
  if (!e.shiftKey) return;
  S.unlocked = ROSTER.map(c => c.id); persist(); render();
});

load();
