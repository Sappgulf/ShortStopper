import { classifyRoute } from "./route_policy.js";
import { parseShortFormPath } from "./shortform.js";

/**
 * @typedef {{ action: "allow" | "block" | "unknown", reason: string, isFeed?: boolean, convertUrl?: string }} RoutePolicy
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
 * @typedef {{ block: boolean, reason: string, redirectUrl?: string }} BlockDecision
 */

/**
 * @param {import("../storage/settings.js").Settings & { __redirectEnabled?: boolean, enabled?: boolean, strictRedirect?: boolean, whitelistMode?: boolean }} effective
 * @param {RoutePolicy} policy
 * @param {string} siteId
 * @param {string} currentUrl
 * @returns {BlockDecision}
 */
export function shouldBlockRoute(effective, policy, siteId, currentUrl) {
  if (!effective?.enabled) return { block: false, reason: "disabled" };
  if (!effective.redirectShorts) return { block: false, reason: "redirect_off" };
  if (policy.action !== "block") return { block: false, reason: "allowed" };

  let canBlockByMode = !!effective.__redirectEnabled;
  if (siteId === "youtube" && effective.strictRedirect && !effective.whitelistMode) {
    canBlockByMode = true;
  }
  if (!canBlockByMode) return { block: false, reason: "mode_off" };

  // Determine redirect URL
  let redirectUrl = null;
  
  // If we have a convertUrl (e.g., Shorts -> Watch), use that
  if (policy.convertUrl) {
    try {
      redirectUrl = new URL(policy.convertUrl, currentUrl).href;
    } catch {
      redirectUrl = null;
    }
  }

  return { 
    block: true, 
    reason: policy.reason || "blocked",
    redirectUrl
  };
}

/**
 * Check if a URL is a safe redirect target (won't cause loops)
 * @param {string} siteId
 * @param {string} targetUrl
 * @returns {boolean}
 */
export function isSafeRedirectTarget(siteId, targetUrl) {
  try {
    const policy = classifyRoute(siteId, targetUrl);
    return policy.action !== "block";
  } catch {
    return false;
  }
}
