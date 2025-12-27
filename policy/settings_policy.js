import { VALID_CHANNEL_MODES } from "../storage/settings.js";
import { normalizeKey } from "../runtime/channel.js";

const SITE_SETTING_KEYS = {
  youtube: "blockYouTubeShorts",
  instagram: "blockInstagramReels",
  facebook: "blockFacebookReels",
  tiktok: "blockTikTok",
  snapchat: "blockSnapchatSpotlight",
  pinterest: "blockPinterestWatch"
};

/**
 * @param {import("../storage/settings.js").Settings} settings
 * @param {string | null} channelKey
 */
export function isWhitelisted(settings, channelKey) {
  const list = Array.isArray(settings.channelWhitelist) ? settings.channelWhitelist : [];
  const ck = normalizeKey(channelKey);
  return !!ck && list.some((x) => normalizeKey(x) === ck);
}

/**
 * @param {import("../storage/settings.js").Settings} settings
 * @param {string | null} channelKey
 */
export function computeMode(settings, channelKey) {
  const overrides = settings.channelOverrides || {};
  const raw = channelKey ? overrides[channelKey] : null;

  if (raw && VALID_CHANNEL_MODES.has(raw)) return raw;

  if (settings.whitelistMode) return isWhitelisted(settings, channelKey) ? "off" : "both";

  return "both";
}

/**
 * @param {import("../storage/settings.js").Settings} settings
 * @param {string | null} channelKey
 */
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

/**
 * @param {import("../storage/settings.js").Settings} settings
 */
export function shouldEnableShortsRuleset(settings) {
  return (
    !!settings.enabled &&
    !!settings.blockYouTubeShorts &&
    !!settings.redirectShorts &&
    !!settings.strictRedirect &&
    !settings.whitelistMode
  );
}

/**
 * @param {import("../storage/settings.js").Settings} settings
 */
export function shouldEnableAdBlockRuleset(settings) {
  return !!settings.adBlockEnabled;
}

/**
 * @param {import("../storage/settings.js").Settings} settings
 * @param {string} siteId
 */
export function isSiteEnabled(settings, siteId) {
  if (!settings?.enabled) return false;
  const key = SITE_SETTING_KEYS[siteId];
  if (!key) return false;
  return settings[key] !== false;
}
