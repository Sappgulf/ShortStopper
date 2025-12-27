import {
  createTab,
  getRuntimeUrl,
  getSync,
  openOptionsPage,
  permissionsContains,
  permissionsRequest,
  queryTabs,
  sendRuntimeMessage,
  sendTabMessage,
  setSync
} from "../../../platform/chrome.js";
import { ADBLOCK_HOSTS } from "../../../policy/adblock_hosts.js";
import { siteFromHost } from "../../../policy/shortform.js";
import { DEFAULT_SETTINGS, sanitizeSettings } from "../../../storage/settings.js";

const TOGGLE_IDS = [
  "enabled",
  "blockYouTubeShorts",
  "blockInstagramReels",
  "blockFacebookReels",
  "blockTikTok",
  "blockSnapchatSpotlight",
  "blockPinterestWatch",
  "adBlockEnabled",
  "adblockInsights",
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
  const tabs = await queryTabs({ active: true, currentWindow: true });
  return tabs[0] || null;
}

async function sendToTab(tabId, msg) {
  try { return await sendTabMessage(tabId, msg); }
  catch { return null; }
}

async function loadCounter() {
  const res = await sendRuntimeMessage({ type: "ns.getTotals" });
  const total = res?.blockedTotal ?? 0;
  $("counterTag").textContent = `${total} blocked today`;
}

async function ensureAdblockPermission() {
  const origins = ADBLOCK_HOSTS;
  const has = await permissionsContains(origins);
  if (has) return true;
  try {
    return await permissionsRequest(origins);
  } catch {
    return false;
  }
}

async function ensureInsightsPermission() {
  const origins = ADBLOCK_HOSTS;
  const permissions = ["declarativeNetRequestFeedback"];
  const has = await permissionsContains(origins, permissions);
  if (has) return true;
  try {
    return await permissionsRequest(origins, permissions);
  } catch {
    return false;
  }
}

async function hasInsightsPermission() {
  try {
    return await permissionsContains(ADBLOCK_HOSTS, ["declarativeNetRequestFeedback"]);
  } catch {
    return false;
  }
}

function renderAdblockDomains(list) {
  const ul = $("adblockDomains");
  if (!ul) return;
  ul.textContent = "";
  if (!list.length) {
    const li = document.createElement("li");
    li.className = "muted";
    li.textContent = "No blocked domains yet.";
    ul.appendChild(li);
    return;
  }
  list.forEach(({ host, count }) => {
    const li = document.createElement("li");
    const label = document.createElement("span");
    label.textContent = host;
    const value = document.createElement("span");
    value.textContent = String(count);
    li.append(label, value);
    ul.appendChild(li);
  });
}

async function refreshAdblockInsights(tabId, settings) {
  const section = $("adblockInsightsSection");
  if (!section) return;
  const enableBtn = $("adblockInsightsEnable");
  const refreshBtn = $("adblockInsightsRefresh");
  const note = $("adblockInsightsNote");
  const totalNode = $("adblockTabTotal");
  const videoNode = $("adblockVideoTotal");
  const videoLabel = $("adblockVideoLabel");

  if (!enableBtn || !refreshBtn || !note || !totalNode || !videoNode || !videoLabel) return;

  const insightsOn = !!settings.adblockInsights;
  const adblockOn = !!settings.adBlockEnabled;
  const hasPerm = await hasInsightsPermission();

  enableBtn.style.display = insightsOn && hasPerm ? "none" : "";
  refreshBtn.disabled = !insightsOn || !hasPerm;

  if (!insightsOn) {
    note.textContent = "Enable insights to see blocked requests by domain.";
    totalNode.textContent = "—";
    videoNode.textContent = "—";
    videoLabel.textContent = "";
    renderAdblockDomains([]);
    return;
  }

  if (!hasPerm) {
    note.textContent = "Grant permission to read matched adblock rules for this tab.";
    totalNode.textContent = "—";
    videoNode.textContent = "—";
    videoLabel.textContent = "";
    renderAdblockDomains([]);
    return;
  }

  if (!adblockOn) {
    note.textContent = "Adblock is off, so no requests are blocked.";
  } else {
    note.textContent = "Counts reflect blocked ad/tracker requests (domains only). History is saved locally in Options.";
  }

  if (!Number.isInteger(tabId)) {
    totalNode.textContent = "—";
    videoNode.textContent = "—";
    videoLabel.textContent = "No active tab.";
    renderAdblockDomains([]);
    return;
  }

  const res = await sendRuntimeMessage({ type: "ns.getAdblockStats", tabId });
  const stats = res?.stats || null;
  if (!stats) {
    totalNode.textContent = "—";
    videoNode.textContent = "—";
    videoLabel.textContent = "";
    renderAdblockDomains([]);
    return;
  }

  totalNode.textContent = String(stats.total ?? 0);
  videoNode.textContent = String(stats.videoTotal ?? 0);
  if (stats.videoId) {
    videoLabel.textContent = stats.videoTitle ? stats.videoTitle : `Video ID: ${stats.videoId}`;
  } else {
    videoLabel.textContent = "No video detected on this tab.";
  }
  renderAdblockDomains(stats.topDomains || []);
}

(async function init() {
  await loadCounter();

  const settings = sanitizeSettings(await getSync(DEFAULT_SETTINGS));

  for (const id of TOGGLE_IDS) $(id).checked = !!settings[id];

  const tab = await getActiveTab();
  const tabId = tab?.id;
  let siteId = null;

  try {
    siteId = tab?.url ? siteFromHost(new URL(tab.url).hostname) : null;
  } catch {
    siteId = null;
  }

  const channelSection = $("channelSection");
  if (channelSection) channelSection.style.display = siteId === "youtube" ? "" : "none";

  let channelKey = null;
  if (tabId && siteId === "youtube") {
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
      whitelistBtn.textContent = "No YouTube channel detected";
      modeSelect.value = "both";
      return;
    }

    whitelistBtn.textContent = isWhitelistedNow() ? "Remove from allowlist" : "Add to allowlist";
    modeSelect.value = currentMode();
  }

  refreshChannelControls();

  for (const id of TOGGLE_IDS) {
    $(id).addEventListener("change", async () => {
      if (id === "adBlockEnabled" && $(id).checked) {
        const ok = await ensureAdblockPermission();
        if (!ok) {
          $(id).checked = false;
          settings[id] = false;
          await setSync({ [id]: false });
          setStatus("Permission denied");
          return;
        }
      }

      if (id === "adblockInsights" && $(id).checked) {
        const ok = await ensureInsightsPermission();
        if (!ok) {
          $(id).checked = false;
          settings[id] = false;
          await setSync({ [id]: false });
          setStatus("Permission denied");
          return;
        }
      }

      settings[id] = $(id).checked;
      await setSync({ [id]: settings[id] });
      setStatus("Saved");
      if (tabId) await sendToTab(tabId, { type: "ns.reapply" });
      await loadCounter();

      if (id === "adBlockEnabled" || id === "adblockInsights") {
        await refreshAdblockInsights(tabId, settings);
        setTimeout(() => refreshAdblockInsights(tabId, settings), 350);
      }
    });
  }

  whitelistBtn.addEventListener("click", async () => {
    if (!channelKey) return;

    const list = Array.isArray(settings.channelWhitelist) ? settings.channelWhitelist.slice() : [];
    const idx = list.findIndex((x) => norm(x) === norm(channelKey));
    if (idx >= 0) list.splice(idx, 1);
    else list.push(channelKey);

    settings.channelWhitelist = list;
    await setSync({ channelWhitelist: list });
    setStatus("Saved");
    refreshChannelControls();
    if (tabId) await sendToTab(tabId, { type: "ns.reapply" });
  });

  modeSelect.addEventListener("change", async () => {
    if (!channelKey) return;

    const ov = { ...(settings.channelOverrides || {}) };
    ov[channelKey] = modeSelect.value;
    settings.channelOverrides = ov;

    await setSync({ channelOverrides: ov });
    setStatus("Saved");
    if (tabId) await sendToTab(tabId, { type: "ns.reapply" });
  });

  $("resetToday").addEventListener("click", async () => {
    await sendRuntimeMessage({ type: "ns.resetToday" });
    await loadCounter();
    setStatus("Reset");
  });

  $("openOptions").addEventListener("click", (e) => {
    e.preventDefault();
    openOptionsPage();
  });

  $("openStats").addEventListener("click", (e) => {
    e.preventDefault();
    createTab({ url: getRuntimeUrl("adapters/chrome/stats/stats.html") });
  });

  $("adblockInsightsEnable")?.addEventListener("click", async () => {
    const ok = await ensureInsightsPermission();
    if (!ok) {
      setStatus("Permission denied");
      await refreshAdblockInsights(tabId, settings);
      return;
    }
    settings.adblockInsights = true;
    $("adblockInsights").checked = true;
    await setSync({ adblockInsights: true });
    setStatus("Insights enabled");
    await refreshAdblockInsights(tabId, settings);
    setTimeout(() => refreshAdblockInsights(tabId, settings), 350);
  });

  $("adblockInsightsRefresh")?.addEventListener("click", async () => {
    await refreshAdblockInsights(tabId, settings);
  });

  await refreshAdblockInsights(tabId, settings);
})();
