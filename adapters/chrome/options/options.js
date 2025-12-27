import {
  createTab,
  getEnabledRulesets,
  getRuntimeUrl,
  getSync,
  permissionsContains,
  permissionsGetAll,
  permissionsRequest,
  sendRuntimeMessage,
  setSync
} from "../../../platform/chrome.js";
import { ADBLOCK_HOSTS } from "../../../policy/adblock_hosts.js";
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
function flash(id, msg) { $(id).textContent = msg; setTimeout(() => ($(id).textContent = ""), 1400); }
function flashHistoryNote(msg) {
  const el = $("adblockHistoryNote");
  if (!el) return;
  const prev = el.textContent;
  el.textContent = msg;
  setTimeout(() => {
    el.textContent = prev;
  }, 1400);
}

function renderWhitelist(list) {
  const ul = $("whitelistList");
  ul.textContent = "";
  if (!list.length) {
    const li = document.createElement("li");
    const span = document.createElement("span");
    span.className = "muted";
    span.textContent = "Empty";
    li.appendChild(span);
    ul.appendChild(li);
    return;
  }
  for (const key of list) {
    const li = document.createElement("li");
    const label = document.createElement("span");
    label.textContent = key;
    const btn = document.createElement("button");
    btn.className = "btn";
    btn.type = "button";
    btn.dataset.remove = key;
    btn.textContent = "Remove";
    li.append(label, btn);
    ul.appendChild(li);
  }
}

function renderOverrides(map) {
  const tbody = $("overrideTable");
  tbody.textContent = "";
  const entries = Object.entries(map || {}).sort((a, b) => a[0].localeCompare(b[0]));
  if (!entries.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.className = "muted";
    td.colSpan = 3;
    td.textContent = "No overrides yet.";
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }
  for (const [key, mode] of entries) {
    const tr = document.createElement("tr");
    const tdKey = document.createElement("td");
    tdKey.textContent = key;

    const tdMode = document.createElement("td");
    const select = document.createElement("select");
    select.dataset.modeKey = key;
    for (const value of ["both", "hide", "redirect", "off"]) {
      const opt = document.createElement("option");
      opt.value = value;
      opt.textContent = value;
      select.appendChild(opt);
    }
    select.value = mode || "both";
    tdMode.appendChild(select);

    const tdActions = document.createElement("td");
    const btn = document.createElement("button");
    btn.className = "btn";
    btn.type = "button";
    btn.dataset.delOv = key;
    btn.textContent = "Delete";
    tdActions.appendChild(btn);

    tr.append(tdKey, tdMode, tdActions);
    tbody.appendChild(tr);
  }
}

function setBackupText(settings) {
  $("backup").value = JSON.stringify(settings, null, 2);
}

function formatList(values) {
  if (!values || !values.length) return "(none)";
  return values.join(", ");
}

function formatAge(ts) {
  if (!ts) return "—";
  const diff = Date.now() - ts;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.max(1, Math.floor(diff / 60_000))}m ago`;
  if (diff < 86_400_000) return `${Math.max(1, Math.floor(diff / 3_600_000))}h ago`;
  return `${Math.max(1, Math.floor(diff / 86_400_000))}d ago`;
}

function formatFullTime(ts) {
  if (!ts) return "";
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return "";
  }
}

async function runSafetyCheck() {
  const reportEl = $("safetyReport");
  if (!reportEl) return;

  let perms = [];
  let origins = [];
  try {
    const all = await permissionsGetAll();
    perms = all?.permissions || [];
    origins = all?.origins || [];
  } catch {}

  const lines = [
    "Storage: chrome.storage.sync + chrome.storage.local",
    "Remote endpoints: none configured in this build",
    "Adblock insights: domains only (no URLs stored)",
    "Adblock history: local-only, auto-trimmed",
    `Granted permissions: ${formatList(perms)}`,
    `Granted host access: ${formatList(origins)}`,
    `Adblock domains: ${ADBLOCK_HOSTS.length} scoped domains`
  ];

  reportEl.textContent = lines.join("\n");
}

function formatTime(d) {
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

let lastAdblockStatus = null;
let lastAdblockCheckAt = null;
let currentSettings = null;
let lastAdblockHistory = null;

function updateStatusStrip(settings) {
  const enabledCard = $("statusEnabledCard");
  const enabledValue = $("statusEnabled");
  const adblockCard = $("statusAdblockCard");
  const adblockValue = $("statusAdblock");
  const checkedValue = $("statusChecked");
  if (!enabledValue || !adblockValue || !checkedValue) return;

  const enabled = !!settings?.enabled;
  enabledValue.textContent = enabled ? "On" : "Off";
  if (enabledCard) enabledCard.dataset.state = enabled ? "on" : "off";

  if (lastAdblockStatus) {
    adblockValue.textContent = lastAdblockStatus.summaryShort;
    if (adblockCard) adblockCard.dataset.state = lastAdblockStatus.state;
  } else {
    adblockValue.textContent = "—";
    if (adblockCard) adblockCard.dataset.state = "off";
  }

  checkedValue.textContent = lastAdblockCheckAt ? formatTime(lastAdblockCheckAt) : "—";
}

async function refreshAdblockStatus(settingsOverride = null) {
  const container = $("adblockStatus");
  const textNode = $("adblockStatusText");
  const grantBtn = $("adblockGrant");
  if (!container || !textNode || !grantBtn) return;

  let settings = settingsOverride || currentSettings;
  if (!settings) {
    try {
      settings = sanitizeSettings(await getSync(DEFAULT_SETTINGS));
    } catch {
      settings = { ...DEFAULT_SETTINGS };
    }
  }

  let hasAllHosts = false;
  let hasInsightsPerm = false;
  let enabledRulesets = [];
  try { hasAllHosts = await permissionsContains(ADBLOCK_HOSTS); } catch {}
  if (settings.adblockInsights) {
    try {
      hasInsightsPerm = await permissionsContains(ADBLOCK_HOSTS, ["declarativeNetRequestFeedback"]);
    } catch {}
  }
  try { enabledRulesets = await getEnabledRulesets(); } catch {}

  const settingOn = !!settings.adBlockEnabled;
  const rulesetOn = Array.isArray(enabledRulesets) && enabledRulesets.includes("basic_block");

  let summary = "Adblock: off";
  let state = "off";
  if (settingOn && !hasAllHosts) {
    summary = "Adblock: needs permission";
    state = "needs-permission";
  } else if (settingOn && !rulesetOn) {
    summary = "Adblock: enabling...";
    state = "enabling";
  } else if (settingOn && rulesetOn) {
    summary = "Adblock: active";
    state = "active";
  }

  const details = `setting ${settingOn ? "on" : "off"} · permission ${hasAllHosts ? "granted" : "missing"} · ruleset ${rulesetOn ? "enabled" : "disabled"}`;
  container.dataset.state = state;
  textNode.textContent = summary;
  textNode.title = details;

  const summaryShort =
    state === "active" ? "Active" :
      state === "needs-permission" ? "Needs permission" :
        state === "enabling" ? "Enabling" : "Off";

  lastAdblockStatus = { state, summaryShort };
  lastAdblockCheckAt = new Date();
  updateStatusStrip(settings);

  const needsInsightsPerm = !!settings.adblockInsights && !hasInsightsPerm;
  grantBtn.disabled = !(state === "needs-permission" || needsInsightsPerm);
  grantBtn.textContent = needsInsightsPerm && state !== "needs-permission"
    ? "Grant insights permission"
    : "Grant permission";
}

async function openStats() {
  await createTab({ url: getRuntimeUrl("adapters/chrome/stats/stats.html") });
}

function renderAdblockHistory(history) {
  const tbody = $("adblockHistoryTable");
  const note = $("adblockHistoryNote");
  if (!tbody || !note) return;

  const entries = Array.isArray(history?.entries) ? history.entries : [];
  const updatedAt = history?.updatedAt || 0;
  const maxDays = history?.maxDays || 0;
  const maxEntries = history?.maxEntries || 0;

  tbody.textContent = "";
  if (!entries.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 3;
    td.className = "muted";
    td.textContent = "No history yet.";
    tr.appendChild(td);
    tbody.appendChild(tr);
  } else {
    for (const entry of entries) {
      const tr = document.createElement("tr");
      const tdHost = document.createElement("td");
      tdHost.textContent = entry.host || "";
      const tdHits = document.createElement("td");
      tdHits.textContent = String(entry.hits ?? 0);
      const tdLast = document.createElement("td");
      tdLast.textContent = formatAge(entry.lastSeen);
      tdLast.title = formatFullTime(entry.lastSeen);
      tr.append(tdHost, tdHits, tdLast);
      tbody.appendChild(tr);
    }
  }

  const updatedLabel = updatedAt ? `Updated ${formatAge(updatedAt)}` : "Not updated yet";
  const trimLabel = maxDays && maxEntries
    ? `Keeps up to ${maxEntries} domains for ${maxDays} days.`
    : "Auto-trimmed.";
  const insightOn = !!currentSettings?.adblockInsights;
  const insightLabel = insightOn
    ? "Insights enabled."
    : "Enable insights to collect new history.";

  note.textContent = `${updatedLabel} ${trimLabel} ${insightLabel} Only blocked requests appear.`;
}

async function loadAdblockHistory() {
  const res = await sendRuntimeMessage({ type: "ns.getAdblockHistory" });
  const history = res?.history || null;
  lastAdblockHistory = history;
  renderAdblockHistory(history);
}

async function copyAdblockHistory() {
  if (!lastAdblockHistory?.entries?.length) {
    flashHistoryNote("No history to copy");
    return;
  }
  const lines = lastAdblockHistory.entries.map((entry) => {
    const stamp = entry.lastSeen ? new Date(entry.lastSeen).toISOString() : "";
    return `${entry.host}\t${entry.hits ?? 0}\t${stamp}`;
  });
  try {
    await navigator.clipboard.writeText(lines.join("\n"));
    flashHistoryNote("Copied");
  } catch {
    flashHistoryNote("Copy failed");
  }
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

(async function init() {
  const s = await getSync(DEFAULT_SETTINGS);
  const settings = sanitizeSettings(s);
  currentSettings = settings;

  for (const id of TOGGLE_IDS) $(id).checked = !!settings[id];
  renderWhitelist(settings.channelWhitelist || []);
  renderOverrides(settings.channelOverrides || {});
  setBackupText(settings);
  refreshAdblockStatus(settings);
  loadAdblockHistory();

  for (const id of TOGGLE_IDS) {
    $(id).addEventListener("change", async () => {
      if (id === "adBlockEnabled" && $(id).checked) {
        const ok = await ensureAdblockPermission();
        if (!ok) {
          $(id).checked = false;
          await setSync({ [id]: false });
          flash("status", "Permission denied");
          currentSettings = { ...currentSettings, [id]: false };
          refreshAdblockStatus();
          return;
        }
      }

      if (id === "adblockInsights" && $(id).checked) {
        const ok = await ensureInsightsPermission();
        if (!ok) {
          $(id).checked = false;
          await setSync({ [id]: false });
          flash("status", "Permission denied");
          currentSettings = { ...currentSettings, [id]: false };
          refreshAdblockStatus();
          return;
        }
      }

      await setSync({ [id]: $(id).checked });
      currentSettings = { ...currentSettings, [id]: $(id).checked };
      flash("status", "Saved");

      if (id === "adBlockEnabled" || id === "adblockInsights") {
        refreshAdblockStatus();
        setTimeout(() => refreshAdblockStatus(), 350);
        loadAdblockHistory();
      } else if (id === "enabled") {
        updateStatusStrip(currentSettings);
      }
    });
  }

  $("whitelistList").addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-remove]");
    if (!btn) return;
    const key = btn.getAttribute("data-remove");

    const s2 = sanitizeSettings(await getSync(DEFAULT_SETTINGS));
    const list = s2.channelWhitelist.slice();
    const next = list.filter((x) => x !== key);
    await setSync({ channelWhitelist: next });

    renderWhitelist(next);
    const s3 = sanitizeSettings(await getSync(DEFAULT_SETTINGS));
    setBackupText(s3);
    currentSettings = s3;
    updateStatusStrip(currentSettings);
    flash("status", "Removed");
  });

  $("overrideTable").addEventListener("change", async (e) => {
    const sel = e.target.closest("select[data-mode-key]");
    if (!sel) return;
    const key = sel.getAttribute("data-mode-key");
    const mode = sel.value;

    const s2 = sanitizeSettings(await getSync(DEFAULT_SETTINGS));
    const ov = { ...(s2.channelOverrides || {}) };
    ov[key] = mode;
    await setSync({ channelOverrides: ov });

    const s3 = sanitizeSettings(await getSync(DEFAULT_SETTINGS));
    setBackupText(s3);
    flash("status", "Saved");
  });

  $("overrideTable").addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-del-ov]");
    if (!btn) return;
    const key = btn.getAttribute("data-del-ov");

    const s2 = sanitizeSettings(await getSync(DEFAULT_SETTINGS));
    const ov = { ...(s2.channelOverrides || {}) };
    delete ov[key];
    await setSync({ channelOverrides: ov });

    renderOverrides(ov);
    const s3 = sanitizeSettings(await getSync(DEFAULT_SETTINGS));
    setBackupText(s3);
    currentSettings = s3;
    updateStatusStrip(currentSettings);
    flash("status", "Deleted");
  });

  $("clearWhitelist").addEventListener("click", async () => {
    await setSync({ channelWhitelist: [] });
    renderWhitelist([]);
    const s3 = sanitizeSettings(await getSync(DEFAULT_SETTINGS));
    setBackupText(s3);
    currentSettings = s3;
    updateStatusStrip(currentSettings);
    flash("status", "Cleared");
  });

  $("clearOverrides").addEventListener("click", async () => {
    await setSync({ channelOverrides: {} });
    renderOverrides({});
    const s3 = sanitizeSettings(await getSync(DEFAULT_SETTINGS));
    setBackupText(s3);
    currentSettings = s3;
    updateStatusStrip(currentSettings);
    flash("status", "Cleared");
  });

  $("copy").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText($("backup").value);
      flash("backupStatus", "Copied");
    } catch {
      flash("backupStatus", "Copy failed (browser blocked clipboard).");
    }
  });

  $("restore").addEventListener("click", async () => {
    let obj = null;
    try { obj = JSON.parse($("backup").value); }
    catch { flash("backupStatus", "Invalid JSON"); return; }

    const next = {};
    for (const k of Object.keys(DEFAULT_SETTINGS)) {
      if (k in obj) next[k] = obj[k];
    }

    await setSync(next);

    const merged = sanitizeSettings(await getSync(DEFAULT_SETTINGS));
    for (const id of TOGGLE_IDS) $(id).checked = !!merged[id];
    renderWhitelist(merged.channelWhitelist || []);
    renderOverrides(merged.channelOverrides || {});
    setBackupText(merged);
    currentSettings = merged;
    refreshAdblockStatus(merged);
    flash("backupStatus", "Restored");
  });

  $("resetDefaults").addEventListener("click", async () => {
    const ok = confirm("Reset all settings to defaults?");
    if (!ok) return;

    await setSync(DEFAULT_SETTINGS);
    const merged = sanitizeSettings(await getSync(DEFAULT_SETTINGS));
    for (const id of TOGGLE_IDS) $(id).checked = !!merged[id];
    renderWhitelist(merged.channelWhitelist || []);
    renderOverrides(merged.channelOverrides || {});
    setBackupText(merged);
    currentSettings = merged;
    refreshAdblockStatus(merged);
    flash("backupStatus", "Reset to defaults");
    flash("status", "Reset");
  });

  $("openStats").addEventListener("click", (e) => {
    e.preventDefault();
    openStats();
  });

  $("adblockRefresh")?.addEventListener("click", () => {
    refreshAdblockStatus();
  });

  $("adblockGrant")?.addEventListener("click", async () => {
    const wantsInsights = !!currentSettings?.adblockInsights;
    const ok = wantsInsights ? await ensureInsightsPermission() : await ensureAdblockPermission();
    if (!ok) {
      flash("status", "Permission denied");
      refreshAdblockStatus();
      return;
    }
    refreshAdblockStatus();
    setTimeout(() => refreshAdblockStatus(), 350);
    loadAdblockHistory();
  });

  $("runSafetyCheck")?.addEventListener("click", () => {
    runSafetyCheck();
  });

  $("adblockHistoryRefresh")?.addEventListener("click", () => {
    loadAdblockHistory();
  });

  $("adblockHistoryCopy")?.addEventListener("click", async () => {
    await copyAdblockHistory();
  });

  $("adblockHistoryClear")?.addEventListener("click", async () => {
    const ok = confirm("Clear adblock insights history?");
    if (!ok) return;
    await sendRuntimeMessage({ type: "ns.clearAdblockHistory" });
    await loadAdblockHistory();
    flashHistoryNote("Cleared");
  });
})();
