/**
 * @typedef {Object} Settings
 * @property {boolean} enabled
 * @property {boolean} blockYouTubeShorts
 * @property {boolean} blockInstagramReels
 * @property {boolean} blockFacebookReels
 * @property {boolean} blockTikTok
 * @property {boolean} blockSnapchatSpotlight
 * @property {boolean} blockPinterestWatch
 * @property {boolean} redirectShorts
 * @property {boolean} hideShelves
 * @property {boolean} hideLinks
 * @property {boolean} hideSidebarEntry
 * @property {boolean} hideChannelShortsTab
 * @property {boolean} strictRedirect
 * @property {boolean} whitelistMode
 * @property {string[]} channelWhitelist
 * @property {Record<string, "hide" | "redirect" | "both" | "off">} channelOverrides
 * @property {boolean} adBlockEnabled
 * @property {boolean} adblockInsights
 */

/**
 * @typedef {Object} LocalState
 * @property {string} blockedDate
 * @property {number} blockedTotal
 * @property {{ days: Record<string, { total: number, channels: Record<string, number> }> }} stats
 */

export const MAX_DAYS = 90;

/** @type {Settings} */
export const DEFAULT_SETTINGS = {
  enabled: true,

  blockYouTubeShorts: true,
  blockInstagramReels: true,
  blockFacebookReels: true,
  blockTikTok: true,
  blockSnapchatSpotlight: true,
  blockPinterestWatch: true,

  redirectShorts: true,
  hideShelves: true,
  hideLinks: true,
  hideSidebarEntry: true,
  hideChannelShortsTab: true,

  strictRedirect: true,
  whitelistMode: false,
  channelWhitelist: [],
  channelOverrides: {},

  adBlockEnabled: true,
  adblockInsights: false
};

/** @type {LocalState} */
export const DEFAULT_LOCAL_STATE = {
  blockedDate: "", // YYYY-MM-DD
  blockedTotal: 0, // today's total
  stats: { days: {} } // { days: { "YYYY-MM-DD": { total, channels: { key: n } } } }
};

export const VALID_CHANNEL_MODES = new Set(["hide", "redirect", "both", "off"]);

/**
 * @template T
 * @param {T} defaults
 * @param {Partial<T>} value
 * @returns {T}
 */
export function mergeDefaults(defaults, value) {
  return { ...defaults, ...(value || {}) };
}

/**
 * @param {Partial<Settings> | null | undefined} raw
 * @returns {Settings}
 */
export function sanitizeSettings(raw) {
  const merged = mergeDefaults(DEFAULT_SETTINGS, raw);
  const whitelist = Array.isArray(merged.channelWhitelist)
    ? merged.channelWhitelist.filter((x) => typeof x === "string").slice(0, 500)
    : [];

  const overrides = {};
  if (merged.channelOverrides && typeof merged.channelOverrides === "object") {
    for (const [key, value] of Object.entries(merged.channelOverrides)) {
      if (typeof key !== "string") continue;
      if (!VALID_CHANNEL_MODES.has(value)) continue;
      overrides[key] = value;
    }
  }

  return {
    enabled: !!merged.enabled,
    blockYouTubeShorts: !!merged.blockYouTubeShorts,
    blockInstagramReels: !!merged.blockInstagramReels,
    blockFacebookReels: !!merged.blockFacebookReels,
    blockTikTok: !!merged.blockTikTok,
    blockSnapchatSpotlight: !!merged.blockSnapchatSpotlight,
    blockPinterestWatch: !!merged.blockPinterestWatch,
    redirectShorts: !!merged.redirectShorts,
    hideShelves: !!merged.hideShelves,
    hideLinks: !!merged.hideLinks,
    hideSidebarEntry: !!merged.hideSidebarEntry,
    hideChannelShortsTab: !!merged.hideChannelShortsTab,
    strictRedirect: !!merged.strictRedirect,
    whitelistMode: !!merged.whitelistMode,
    channelWhitelist: whitelist,
    channelOverrides: overrides,
    adBlockEnabled: !!merged.adBlockEnabled,
    adblockInsights: !!merged.adblockInsights
  };
}
