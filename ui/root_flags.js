/**
 * @param {{ enabled?: boolean, hideShelves?: boolean, hideLinks?: boolean, hideSidebarEntry?: boolean, hideChannelShortsTab?: boolean, __siteId?: string, __adblockActive?: boolean }} effective
 */
export function setRootFlags(effective) {
  const root = document.documentElement;
  root.setAttribute("data-ns-enabled", String(!!effective.enabled));
  root.setAttribute("data-ns-hide-shelves", String(!!effective.hideShelves));
  root.setAttribute("data-ns-hide-links", String(!!effective.hideLinks));
  root.setAttribute("data-ns-hide-sidebar", String(!!effective.hideSidebarEntry));
  root.setAttribute("data-ns-hide-channel-tab", String(!!effective.hideChannelShortsTab));
  root.setAttribute("data-ns-site", effective.__siteId || "");
  root.setAttribute("data-ns-adblock", String(!!effective.__adblockActive));
}
