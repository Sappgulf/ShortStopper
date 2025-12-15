import { DEFAULT_LOCAL_STATE, DEFAULT_SETTINGS } from "../../core/config.js";
import { shouldEnableAdBlockRuleset, shouldEnableShortsRuleset } from "../../core/policy.js";
import {
  bumpBlockedLocal,
  ensureSettingsDefaults,
  ensureTodayLocal,
  getLocalState,
  getSettings,
  resetTodayLocal
} from "./storage.js";

async function setBadge(total) {
  const text = total <= 0 ? "" : total > 999 ? "999+" : String(total);
  await chrome.action.setBadgeText({ text });
  await chrome.action.setBadgeBackgroundColor({ color: "#4a7dff" });
}

async function applyRulesets(settings) {
  const enableRulesetIds = [];
  const disableRulesetIds = [];

  if (shouldEnableShortsRuleset(settings)) enableRulesetIds.push("shorts_redirect");
  else disableRulesetIds.push("shorts_redirect");

  let canBlockAllHosts = false;
  try {
    canBlockAllHosts = await chrome.permissions.contains({ origins: ["<all_urls>"] });
  } catch {}

  if (shouldEnableAdBlockRuleset(settings) && canBlockAllHosts) enableRulesetIds.push("basic_block");
  else disableRulesetIds.push("basic_block");

  await chrome.declarativeNetRequest.updateEnabledRulesets({
    enableRulesetIds,
    disableRulesetIds
  });
}

chrome.runtime.onInstalled.addListener(async () => {
  const currentSync = await chrome.storage.sync.get(null);
  if (!currentSync || Object.keys(currentSync).length === 0) await chrome.storage.sync.set(DEFAULT_SETTINGS);
  else await ensureSettingsDefaults();

  const currentLocal = await chrome.storage.local.get(null);
  if (!currentLocal || Object.keys(currentLocal).length === 0) await chrome.storage.local.set(DEFAULT_LOCAL_STATE);

  const ensured = await ensureTodayLocal();
  await setBadge(ensured.state.blockedTotal || 0);
  await applyRulesets(await getSettings());
});

chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== "sync") return;

  const keys = Object.keys(changes);
  if (
    keys.includes("enabled") ||
    keys.includes("adBlockEnabled") ||
    keys.includes("redirectShorts") ||
    keys.includes("strictRedirect") ||
    keys.includes("whitelistMode")
  ) {
    await applyRulesets(await getSettings());
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    if (!msg?.type) return;

    if (msg.type === "ns.bumpBlocked") {
      const res = await bumpBlockedLocal(msg.amount ?? 1, msg.channelKey ?? null);
      await setBadge(res.total || 0);
      sendResponse({ ok: true, total: res.total || 0 });
      return;
    }

    if (msg.type === "ns.getTotals") {
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

    if (msg.type === "ns.resetToday") {
      await resetTodayLocal();
      await setBadge(0);
      sendResponse({ ok: true });
      return;
    }

    if (msg.type === "ns.getStats") {
      const ensured = await ensureTodayLocal();
      const local = ensured.state || (await getLocalState());
      await setBadge(local.blockedTotal || 0);
      sendResponse({ ok: true, stats: local.stats || { days: {} } });
      return;
    }
  })();

  return true;
});
