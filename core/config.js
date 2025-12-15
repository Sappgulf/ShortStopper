export const MAX_DAYS = 90;

export const DEFAULT_SETTINGS = {
  enabled: true,

  redirectShorts: true,
  hideShelves: true,
  hideLinks: true,
  hideSidebarEntry: true,
  hideChannelShortsTab: true,

  strictRedirect: true,
  whitelistMode: false,
  channelWhitelist: [],
  channelOverrides: {},

  adBlockEnabled: false
};

export const DEFAULT_LOCAL_STATE = {
  blockedDate: "", // YYYY-MM-DD
  blockedTotal: 0, // today's total
  stats: { days: {} } // { days: { "YYYY-MM-DD": { total, channels: { key: n } } } }
};

export const VALID_CHANNEL_MODES = new Set(["hide", "redirect", "both", "off"]);

export function mergeDefaults(defaults, value) {
  return { ...defaults, ...(value || {}) };
}

