import { DEFAULT_LOCAL_STATE, DEFAULT_SETTINGS } from "../../storage/settings.js";
import { ADBLOCK_HOSTS } from "../../policy/adblock_hosts.js";
import { shouldEnableAdBlockRuleset, shouldEnableShortsRuleset } from "../../policy/settings_policy.js";
import {
  addRuntimeMessageListener,
  addStorageChangeListener,
  getRuntimeId,
  getLocal,
  getSync,
  permissionsContains,
  openOptionsPage,
  setBadgeBackgroundColor,
  setBadgeText,
  setLocal,
  setSync,
  updateRulesets
} from "../../platform/chrome.js";
import {
  getMessageType,
  parseAdblockStatsRequest,
  parseBumpBlockedPayload,
  parseVideoContextPayload,
  SERVICE_WORKER_MESSAGE_TYPES
} from "../../platform/messages.js";
import {
  bumpBlockedLocal,
  ensureSettingsDefaults,
  ensureTodayLocal,
  getLocalState,
  getSettings,
  resetTodayLocal
} from "./storage.js";

const AD_RULESET_ID = "basic_block";
const AD_RULE_ID_MIN = 1000;
const AD_RULE_ID_MAX = 2000;
const MAX_VIDEO_HISTORY = 20;
const MAX_DOMAIN_ENTRIES = 6;
const ADBLOCK_HISTORY_KEY = "adblockHistory";
const ADBLOCK_HISTORY_MAX = 200;
const ADBLOCK_HISTORY_VIEW_LIMIT = 80;
const ADBLOCK_HISTORY_MAX_AGE_DAYS = 30;
const ADBLOCK_HISTORY_FLUSH_MS = 3000;

const adblockState = new Map();
let adblockInsightsEnabled = false;
let adblockHistory = null;
let adblockHistoryLoaded = false;
let adblockHistoryLoadPromise = null;
let adblockHistoryDirty = false;
let adblockHistoryFlushTimer = null;

(async () => {
  try {
    const settings = await getSettings();
    adblockInsightsEnabled = !!settings.adblockInsights;
  } catch {
    adblockInsightsEnabled = false;
  }
})();

(async () => {
  try {
    await ensureAdblockHistoryLoaded();
  } catch {}
})();

function getTabState(tabId) {
  let state = adblockState.get(tabId);
  if (!state) {
    state = {
      total: 0,
      domains: new Map(),
      currentVideoId: null,
      currentVideoTitle: null,
      videoCounts: new Map(),
      videoOrder: []
    };
    adblockState.set(tabId, state);
  }
  return state;
}

function bumpCount(map, key) {
  map.set(key, (map.get(key) || 0) + 1);
}

function trimVideoHistory(state) {
  while (state.videoOrder.length > MAX_VIDEO_HISTORY) {
    const oldest = state.videoOrder.shift();
    if (oldest) state.videoCounts.delete(oldest);
  }
}

function updateVideoContext(tabId, videoId, title) {
  const state = getTabState(tabId);
  state.currentVideoId = videoId || null;
  state.currentVideoTitle = title || null;

  if (!videoId) return;

  if (!state.videoCounts.has(videoId)) {
    state.videoCounts.set(videoId, { total: 0, domains: new Map(), title: title || null });
    state.videoOrder.push(videoId);
    trimVideoHistory(state);
  } else if (title) {
    const existing = state.videoCounts.get(videoId);
    if (existing) existing.title = title;
  }
}

function recordAdblockHit(tabId, host) {
  const state = getTabState(tabId);
  state.total += 1;
  bumpCount(state.domains, host);

  const vid = state.currentVideoId;
  if (!vid) return;
  let video = state.videoCounts.get(vid);
  if (!video) {
    video = { total: 0, domains: new Map(), title: state.currentVideoTitle || null };
    state.videoCounts.set(vid, video);
    state.videoOrder.push(vid);
    trimVideoHistory(state);
  }
  video.total += 1;
  bumpCount(video.domains, host);
}

function toTopDomains(map, limit) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([host, count]) => ({ host, count }));
}

function emptyAdblockHistory() {
  return { updatedAt: 0, entries: {} };
}

function normalizeHost(host) {
  return String(host || "").trim().toLowerCase();
}

function sanitizeAdblockHistory(raw) {
  const base = raw && typeof raw === "object" ? raw : {};
  const entries = {};
  const rawEntries = base.entries && typeof base.entries === "object" ? base.entries : {};
  for (const [host, info] of Object.entries(rawEntries)) {
    const key = normalizeHost(host);
    if (!key) continue;
    const hits = Number.isFinite(info?.hits) ? Math.max(0, info.hits | 0) : 0;
    const firstSeen = Number.isFinite(info?.firstSeen) ? info.firstSeen : 0;
    const lastSeen = Number.isFinite(info?.lastSeen) ? info.lastSeen : 0;
    if (!hits && !lastSeen) continue;
    entries[key] = {
      hits,
      firstSeen: firstSeen || lastSeen || 0,
      lastSeen: lastSeen || firstSeen || 0
    };
  }
  return {
    updatedAt: Number.isFinite(base.updatedAt) ? base.updatedAt : 0,
    entries
  };
}

async function ensureAdblockHistoryLoaded() {
  if (adblockHistoryLoaded) return;
  if (adblockHistoryLoadPromise) return adblockHistoryLoadPromise;
  adblockHistoryLoadPromise = (async () => {
    try {
      const local = await getLocal({ [ADBLOCK_HISTORY_KEY]: null });
      adblockHistory = sanitizeAdblockHistory(local?.[ADBLOCK_HISTORY_KEY]) || emptyAdblockHistory();
    } catch {
      adblockHistory = emptyAdblockHistory();
    } finally {
      adblockHistoryLoaded = true;
    }
  })();
  return adblockHistoryLoadPromise;
}

function applyHistoryHit(history, host) {
  const key = normalizeHost(host);
  if (!key) return;
  const now = Date.now();
  const entry = history.entries[key] || { hits: 0, firstSeen: now, lastSeen: now };
  entry.hits = (entry.hits || 0) + 1;
  entry.lastSeen = now;
  if (!entry.firstSeen) entry.firstSeen = now;
  history.entries[key] = entry;
}

function pruneAdblockHistory(history) {
  const entries = history.entries || {};
  const now = Date.now();
  const maxAgeMs = ADBLOCK_HISTORY_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
  for (const [host, entry] of Object.entries(entries)) {
    if (!entry?.lastSeen || now - entry.lastSeen > maxAgeMs) delete entries[host];
  }

  const ordered = Object.entries(entries).sort((a, b) => (b[1]?.lastSeen || 0) - (a[1]?.lastSeen || 0));
  if (ordered.length > ADBLOCK_HISTORY_MAX) {
    for (let i = ADBLOCK_HISTORY_MAX; i < ordered.length; i++) {
      delete entries[ordered[i][0]];
    }
  }
}

async function flushAdblockHistory() {
  if (!adblockHistoryDirty || !adblockHistory) return;
  pruneAdblockHistory(adblockHistory);
  adblockHistory.updatedAt = Date.now();
  adblockHistoryDirty = false;
  await setLocal({ [ADBLOCK_HISTORY_KEY]: adblockHistory });
}

function scheduleAdblockHistoryFlush() {
  if (adblockHistoryFlushTimer) return;
  adblockHistoryFlushTimer = setTimeout(() => {
    adblockHistoryFlushTimer = null;
    flushAdblockHistory().catch(() => {});
  }, ADBLOCK_HISTORY_FLUSH_MS);
}

async function recordAdblockHistory(host) {
  try {
    await ensureAdblockHistoryLoaded();
    if (!adblockHistory) return;
    applyHistoryHit(adblockHistory, host);
    adblockHistoryDirty = true;
    scheduleAdblockHistoryFlush();
  } catch {}
}

function getAdblockHistorySnapshot(limit = ADBLOCK_HISTORY_VIEW_LIMIT) {
  const entries = adblockHistory?.entries || {};
  const list = Object.entries(entries)
    .map(([host, info]) => ({
      host,
      hits: info?.hits || 0,
      firstSeen: info?.firstSeen || 0,
      lastSeen: info?.lastSeen || 0
    }))
    .sort((a, b) => b.lastSeen - a.lastSeen)
    .slice(0, limit);
  return {
    entries: list,
    updatedAt: adblockHistory?.updatedAt || 0,
    maxDays: ADBLOCK_HISTORY_MAX_AGE_DAYS,
    maxEntries: ADBLOCK_HISTORY_MAX
  };
}

function getAdblockStats(tabId) {
  if (!adblockInsightsEnabled) {
    return {
      enabled: false,
      total: 0,
      videoTotal: 0,
      videoId: null,
      videoTitle: null,
      topDomains: []
    };
  }

  const state = adblockState.get(tabId);
  if (!state) {
    return {
      enabled: adblockInsightsEnabled,
      total: 0,
      videoTotal: 0,
      videoId: null,
      videoTitle: null,
      topDomains: []
    };
  }

  const videoStats = state.currentVideoId ? state.videoCounts.get(state.currentVideoId) : null;
  return {
    enabled: adblockInsightsEnabled,
    total: state.total || 0,
    videoTotal: videoStats?.total || 0,
    videoId: state.currentVideoId || null,
    videoTitle: videoStats?.title || state.currentVideoTitle || null,
    topDomains: toTopDomains(state.domains, MAX_DOMAIN_ENTRIES)
  };
}

async function setBadge(total) {
  const text = total <= 0 ? "" : total > 999 ? "999+" : String(total);
  await setBadgeText(text);
  await setBadgeBackgroundColor("#4a7dff");
}

async function applyRulesets(settings) {
  const enableRulesetIds = [];
  const disableRulesetIds = [];

  if (shouldEnableShortsRuleset(settings)) enableRulesetIds.push("shorts_redirect");
  else disableRulesetIds.push("shorts_redirect");

  let canBlockAdHosts = false;
  try {
    canBlockAdHosts = await permissionsContains(ADBLOCK_HOSTS);
  } catch {}

  if (shouldEnableAdBlockRuleset(settings) && canBlockAdHosts) enableRulesetIds.push("basic_block");
  else disableRulesetIds.push("basic_block");

  await updateRulesets(enableRulesetIds, disableRulesetIds);
}

chrome.declarativeNetRequest?.onRuleMatchedDebug?.addListener?.((info) => {
  if (!adblockInsightsEnabled) return;
  const rule = info?.rule || {};
  const request = info?.request || {};
  const rulesetId = rule.rulesetId;
  const ruleId = rule.ruleId;
  if (rulesetId && rulesetId !== AD_RULESET_ID) return;
  if (!rulesetId && !(ruleId >= AD_RULE_ID_MIN && ruleId < AD_RULE_ID_MAX)) return;

  const tabId = request.tabId;
  if (!Number.isInteger(tabId) || tabId < 0) return;
  if (typeof request.url !== "string") return;

  let host = "";
  try {
    host = new URL(request.url).hostname;
  } catch {
    return;
  }

  recordAdblockHit(tabId, host);
  recordAdblockHistory(host);
});

chrome.tabs?.onRemoved?.addListener?.((tabId) => {
  adblockState.delete(tabId);
});

chrome.runtime?.onSuspend?.addListener?.(() => {
  flushAdblockHistory().catch(() => {});
});

chrome.runtime.onInstalled.addListener(async () => {
  const currentSync = await getSync(null);
  if (!currentSync || Object.keys(currentSync).length === 0) await setSync(DEFAULT_SETTINGS);
  else await ensureSettingsDefaults();

  const currentLocal = await getLocal(null);
  if (!currentLocal || Object.keys(currentLocal).length === 0) await setLocal(DEFAULT_LOCAL_STATE);

  const ensured = await ensureTodayLocal();
  await setBadge(ensured.state.blockedTotal || 0);
  const settings = await getSettings();
  adblockInsightsEnabled = !!settings.adblockInsights;
  await applyRulesets(settings);
});

addStorageChangeListener(async (changes, area) => {
  if (area !== "sync") return;

  const keys = Object.keys(changes);
  if (
    keys.includes("enabled") ||
    keys.includes("blockYouTubeShorts") ||
    keys.includes("adBlockEnabled") ||
    keys.includes("redirectShorts") ||
    keys.includes("strictRedirect") ||
    keys.includes("whitelistMode") ||
    keys.includes("adblockInsights")
  ) {
    const settings = await getSettings();
    adblockInsightsEnabled = !!settings.adblockInsights;
    if (!adblockInsightsEnabled) {
      adblockState.clear();
      flushAdblockHistory().catch(() => {});
    }
    await applyRulesets(settings);
  }
});

addRuntimeMessageListener((msg, sender, sendResponse) => {
  (async () => {
    if (!sender?.id || sender.id !== getRuntimeId()) return;
    const type = getMessageType(msg, SERVICE_WORKER_MESSAGE_TYPES);
    if (!type) return;

    if (type === "ns.bumpBlocked") {
      const { amount, channelKey } = parseBumpBlockedPayload(msg);
      const res = await bumpBlockedLocal(amount, channelKey);
      await setBadge(res.total || 0);
      sendResponse({ ok: true, total: res.total || 0 });
      return;
    }

    if (type === "ns.getTotals") {
      const ensured = await ensureTodayLocal();
      const local = ensured.state || (await getLocalState());
      await setBadge(local.blockedTotal || 0);
      sendResponse({
        ok: true,
        blockedTotal: local.blockedTotal || 0,
        blockedDate: local.blockedDate || ""
      });
      return;
    }

    if (type === "ns.resetToday") {
      await resetTodayLocal();
      await setBadge(0);
      sendResponse({ ok: true });
      return;
    }

    if (type === "ns.openOptions") {
      await openOptionsPage();
      sendResponse({ ok: true });
      return;
    }

    if (type === "ns.getStats") {
      const ensured = await ensureTodayLocal();
      const local = ensured.state || (await getLocalState());
      await setBadge(local.blockedTotal || 0);
      sendResponse({ ok: true, stats: local.stats || { days: {} } });
      return;
    }

    if (type === "ns.updateVideoContext") {
      const tabId = sender?.tab?.id;
      if (!Number.isInteger(tabId)) return;
      if (!adblockInsightsEnabled) {
        sendResponse({ ok: false, disabled: true });
        return;
      }
      const { videoId, title } = parseVideoContextPayload(msg);
      updateVideoContext(tabId, videoId, title);
      sendResponse({ ok: true });
      return;
    }

    if (type === "ns.getAdblockStats") {
      const { tabId } = parseAdblockStatsRequest(msg);
      if (!Number.isInteger(tabId)) return;
      let hasInsightsPerm = false;
      try {
        hasInsightsPerm = await permissionsContains(ADBLOCK_HOSTS, ["declarativeNetRequestFeedback"]);
      } catch {}
      if (!hasInsightsPerm) {
        sendResponse({
          ok: true,
          stats: {
            enabled: false,
            total: 0,
            videoTotal: 0,
            videoId: null,
            videoTitle: null,
            topDomains: []
          }
        });
        return;
      }
      sendResponse({ ok: true, stats: getAdblockStats(tabId) });
      return;
    }

    if (type === "ns.getAdblockHistory") {
      await ensureAdblockHistoryLoaded();
      sendResponse({ ok: true, history: getAdblockHistorySnapshot() });
      return;
    }

    if (type === "ns.clearAdblockHistory") {
      adblockHistory = emptyAdblockHistory();
      adblockHistoryLoaded = true;
      adblockHistoryDirty = false;
      await setLocal({ [ADBLOCK_HISTORY_KEY]: adblockHistory });
      sendResponse({ ok: true });
      return;
    }
  })();

  return true;
});
