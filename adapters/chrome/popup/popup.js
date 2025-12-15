import { DEFAULT_SETTINGS } from "../../../core/config.js";

const TOGGLE_IDS = [
  "enabled",
  "adBlockEnabled",
  "whitelistMode",
  "strictRedirect",
  "redirectShorts",
  "hideShelves",
  "hideLinks",
  "hideSidebarEntry",
  "hideChannelShortsTab"
];

function $(id) { return document.getElementById(id); }
function setStatus(t) {
  $("status").textContent = t || "";
  if (t) setTimeout(() => setStatus(""), 1200);
}
function norm(k) { return String(k || "").trim().toLowerCase(); }

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0] || null;
}

async function sendToTab(tabId, msg) {
  try { return await chrome.tabs.sendMessage(tabId, msg); }
  catch { return null; }
}

async function loadCounter() {
  const res = await chrome.runtime.sendMessage({ type: "ns.getTotals" });
  const total = res?.blockedTotal ?? 0;
  $("counterTag").textContent = `${total} blocked today`;
}

async function ensureAllHostsPermission() {
  const origins = ["<all_urls>"];
  const has = await chrome.permissions.contains({ origins });
  if (has) return true;
  try {
    return await chrome.permissions.request({ origins });
  } catch {
    return false;
  }
}

(async function init() {
  await loadCounter();

  const s = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  const settings = { ...DEFAULT_SETTINGS, ...s };

  for (const id of TOGGLE_IDS) $(id).checked = !!settings[id];

  const tab = await getActiveTab();
  const tabId = tab?.id;

  let channelKey = null;
  if (tabId) {
    const res = await sendToTab(tabId, { type: "ns.getChannelKey" });
    channelKey = res?.channelKey || null;
  }

  $("channelKey").textContent = channelKey || "(unknown on this page)";

  const whitelistBtn = $("toggleWhitelist");
  const modeSelect = $("channelMode");

  function isWhitelistedNow() {
    const list = Array.isArray(settings.channelWhitelist) ? settings.channelWhitelist : [];
    return !!channelKey && list.some((x) => norm(x) === norm(channelKey));
  }

  function currentMode() {
    if (!channelKey) return "both";
    const ov = settings.channelOverrides || {};
    return ov[channelKey] || "both";
  }

  function refreshChannelControls() {
    const can = !!channelKey;
    whitelistBtn.disabled = !can;
    modeSelect.disabled = !can;

    if (!can) {
      whitelistBtn.textContent = "No channel detected";
      modeSelect.value = "both";
      return;
    }

    whitelistBtn.textContent = isWhitelistedNow() ? "Remove from whitelist" : "Add to whitelist";
    modeSelect.value = currentMode();
  }

  refreshChannelControls();

  for (const id of TOGGLE_IDS) {
    $(id).addEventListener("change", async () => {
      if (id === "adBlockEnabled" && $(id).checked) {
        const ok = await ensureAllHostsPermission();
        if (!ok) {
          $(id).checked = false;
          settings[id] = false;
          await chrome.storage.sync.set({ [id]: false });
          setStatus("Permission denied");
          return;
        }
      }

      settings[id] = $(id).checked;
      await chrome.storage.sync.set({ [id]: settings[id] });
      setStatus("Saved");
      if (tabId) await sendToTab(tabId, { type: "ns.reapply" });
      await loadCounter();
    });
  }

  whitelistBtn.addEventListener("click", async () => {
    if (!channelKey) return;

    const list = Array.isArray(settings.channelWhitelist) ? settings.channelWhitelist.slice() : [];
    const idx = list.findIndex((x) => norm(x) === norm(channelKey));
    if (idx >= 0) list.splice(idx, 1);
    else list.push(channelKey);

    settings.channelWhitelist = list;
    await chrome.storage.sync.set({ channelWhitelist: list });
    setStatus("Saved");
    refreshChannelControls();
    if (tabId) await sendToTab(tabId, { type: "ns.reapply" });
  });

  modeSelect.addEventListener("change", async () => {
    if (!channelKey) return;

    const ov = { ...(settings.channelOverrides || {}) };
    ov[channelKey] = modeSelect.value;
    settings.channelOverrides = ov;

    await chrome.storage.sync.set({ channelOverrides: ov });
    setStatus("Saved");
    if (tabId) await sendToTab(tabId, { type: "ns.reapply" });
  });

  $("resetToday").addEventListener("click", async () => {
    await chrome.runtime.sendMessage({ type: "ns.resetToday" });
    await loadCounter();
    setStatus("Reset");
  });

  $("openOptions").addEventListener("click", (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });

  $("openStats").addEventListener("click", (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: chrome.runtime.getURL("adapters/chrome/stats/stats.html") });
  });
})();
