import { classifyRoute } from "./route_policy.js";
import { parseShortFormPath } from "./shortform.js";

/**
 * @typedef {{ action: "allow" | "block" | "unknown", reason: string, isFeed?: boolean }} RoutePolicy
 */

/**
 * @param {string} siteId
 * @param {string} url
 * @param {string} pathname
 * @returns {RoutePolicy}
 */
export function resolveRoutePolicy(siteId, url, pathname) {
  const policy = classifyRoute(siteId, url);
  if (policy.action !== "unknown") return policy;

  const parsed = parseShortFormPath(siteId, pathname);
  if (parsed.isShortForm) {
    return { action: "block", reason: parsed.kind || "shortform", isFeed: true };
  }

  return { action: "allow", reason: "non_shortform" };
}

/**
 * @param {import("../storage/settings.js").Settings & { __redirectEnabled?: boolean, enabled?: boolean, strictRedirect?: boolean, whitelistMode?: boolean }} effective
 * @param {RoutePolicy} policy
 * @param {string} siteId
 */
export function shouldBlockRoute(effective, policy, siteId) {
  if (!effective?.enabled) return { block: false, reason: "disabled" };
  if (!effective.redirectShorts) return { block: false, reason: "redirect_off" };
  if (policy.action !== "block") return { block: false, reason: "allowed" };

  let canBlockByMode = !!effective.__redirectEnabled;
  if (siteId === "youtube" && effective.strictRedirect && !effective.whitelistMode) {
    canBlockByMode = true;
  }
  if (!canBlockByMode) return { block: false, reason: "mode_off" };

  return { block: true, reason: policy.reason || "blocked" };
}
