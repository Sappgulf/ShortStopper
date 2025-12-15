import { VALID_CHANNEL_MODES } from "./config.js";
import { normalizeKey } from "./channel.js";

export function isWhitelisted(settings, channelKey) {
  const list = Array.isArray(settings.channelWhitelist) ? settings.channelWhitelist : [];
  const ck = normalizeKey(channelKey);
  return !!ck && list.some((x) => normalizeKey(x) === ck);
}

export function computeMode(settings, channelKey) {
  const overrides = settings.channelOverrides || {};
  const raw = channelKey ? overrides[channelKey] : null;

  if (raw && VALID_CHANNEL_MODES.has(raw)) return raw;

  if (settings.whitelistMode) return isWhitelisted(settings, channelKey) ? "off" : "both";

  return "both";
}

export function resolveEffectiveSettings(settings, channelKey) {
  const mode = computeMode(settings, channelKey);
  const enabled = !!settings.enabled && mode !== "off";

  const hideEnabled = enabled && (mode === "hide" || mode === "both");
  const redirectEnabled = enabled && (mode === "redirect" || mode === "both");

  return {
    ...settings,
    enabled,
    hideShelves: hideEnabled && !!settings.hideShelves,
    hideLinks: hideEnabled && !!settings.hideLinks,
    hideSidebarEntry: hideEnabled && !!settings.hideSidebarEntry,
    hideChannelShortsTab: hideEnabled && !!settings.hideChannelShortsTab,
    __channelKey: channelKey || null,
    __mode: mode,
    __redirectEnabled: redirectEnabled
  };
}

export function shouldEnableShortsRuleset(settings) {
  return (
    !!settings.enabled &&
    !!settings.redirectShorts &&
    !!settings.strictRedirect &&
    !settings.whitelistMode
  );
}

export function shouldEnableAdBlockRuleset(settings) {
  return !!settings.adBlockEnabled;
}

