// Patronus AI popup: your soul collection + the daily "come back tomorrow" unlock.
// Keys are baked in (config.local.js) so judges never type anything.
const ROSTER = [
  { id: "grandma",  e: "👵", n: "Surf Granny" },
  { id: "tungtung", e: "🪵", n: "Tung Tung" },
  { id: "sixseven", e: "✋", n: "Six Seven" },
  { id: "cat",      e: "🐱", n: "Mochi" },
  { id: "dog",      e: "🐶", n: "Biscuit" },
  { id: "pupa",     e: "🐛", n: "Pupa" },
  { id: "skibidi",  e: "🚽", n: "Skibidi" }
];
const START_UNLOCKED = ["grandma", "tungtung", "sixseven", "cat", "dog"]; // 5 now; pupa + skibidi coming soon
const $ = id => document.getElementById(id);
const todayStr = () => new Date().toISOString().slice(0, 10);

let S = { unlocked: START_UNLOCKED.slice(), activeChar: "grandma", lastUnlock: "", streak: 1 };

function load() {
  chrome.storage.local.get(["unlocked", "activeChar", "lastUnlock", "streak", "initDone"], d => {
    if (d.initDone) {
      S.unlocked = Array.isArray(d.unlocked) && d.unlocked.length ? d.unlocked : START_UNLOCKED.slice();
      S.activeChar = d.activeChar && S.unlocked.includes(d.activeChar) ? d.activeChar : S.unlocked[0];
      S.lastUnlock = d.lastUnlock || "";
      S.streak = d.streak || 1;
    } else {
      // first run: 3 souls now, today's unlock already "spent" so the 4th reads "come back tomorrow"
      S.unlocked = START_UNLOCKED.slice(); S.activeChar = "grandma"; S.lastUnlock = todayStr(); S.streak = 1;
      chrome.storage.local.set({ initDone: true });
    }
    persist(); render(); loadPowers();
  });
}
function persist() { chrome.storage.local.set({ unlocked: S.unlocked, activeChar: S.activeChar, lastUnlock: S.lastUnlock, streak: S.streak }); }
function setActive(id) { if (!S.unlocked.includes(id)) return; S.activeChar = id; persist(); render(); }

function nextLocked() { return ROSTER.find(c => !S.unlocked.includes(c.id)); }
function eligibleToday() { return !!nextLocked() && S.lastUnlock !== todayStr(); }
function daysBetween(a, b) { return Math.round((new Date(b) - new Date(a)) / 86400000); }
function doUnlock() {
  const nx = nextLocked(); if (!nx || !eligibleToday()) return;
  S.unlocked.push(nx.id);
  S.streak = (S.lastUnlock && daysBetween(S.lastUnlock, todayStr()) === 1) ? S.streak + 1 : S.streak + 1;
  S.lastUnlock = todayStr();
  S.activeChar = nx.id; // meet the new soul (content script greets via storage change)
  persist(); render();
}

function render() {
  const active = ROSTER.find(c => c.id === S.activeChar) || ROSTER[0];
  $("heroE").innerHTML = ""; const hi = document.createElement("img"); hi.src = `chars/${active.id}.png`; hi.alt = "";
  hi.onerror = () => { $("heroE").textContent = active.e; }; $("heroE").appendChild(hi);
  $("heroN").textContent = active.n;
  $("streak").textContent = S.streak > 1 ? `🔥 ${S.streak}-day streak` : "";

  $("grid").innerHTML = ROSTER.map(c => {
    const unlocked = S.unlocked.includes(c.id);
    const cls = "tile" + (c.id === S.activeChar ? " active" : "") + (unlocked ? "" : " locked");
    const face = unlocked ? `<img class="te" src="chars/${c.id}.png" data-e="${c.e}" alt="">` : `<div class="e">${c.e}</div>`;
    return `<div class="${cls}" data-id="${c.id}">${face}<div class="t">${unlocked ? c.n : "???"}</div></div>`;
  }).join("");
  $("grid").querySelectorAll("img.te").forEach(img => img.onerror = () => { const d = document.createElement("div"); d.className = "e"; d.textContent = img.dataset.e; img.replaceWith(d); });
  document.querySelectorAll(".tile").forEach(t => t.addEventListener("click", () => setActive(t.dataset.id)));

  const box = $("unlockBox");
  if (eligibleToday()) {
    box.innerHTML = `<div class="unlock go" id="ub"><b>✨ A new soul is waiting</b><small>Tap to unlock today's character</small></div>`;
    $("ub").addEventListener("click", doUnlock);
  } else if (nextLocked()) {
    box.innerHTML = `<div class="unlock wait">⏳ A new soul unlocks tomorrow - come back to test it.</div>`;
  } else {
    box.innerHTML = `<div class="unlock wait">🏆 You've awakened every soul. Legend.</div>`;
  }
}

// read-only powers strip - shows which partner powers are wired (no key values)
function loadPowers() {
  const labels = { gemini: "Gemini", slng: "SLNG voice", tavily: "Tavily", mubit: "Mubit", n8n: "n8n", superlinked: "Superlinked" };
  chrome.runtime.sendMessage({ type: "GET_POWERS" }, p => {
    p = p || {};
    $("powers").innerHTML = Object.keys(labels).map(k =>
      `<span class="pw ${p[k] ? "" : "off"}"><span class="dot"></span>${labels[k]}</span>`).join("");
  });
}

// demo helper: shift-click the wand to awaken every soul at once
document.querySelector(".logo").addEventListener("click", e => {
  if (!e.shiftKey) return;
  S.unlocked = ROSTER.map(c => c.id); persist(); render();
});

load();
