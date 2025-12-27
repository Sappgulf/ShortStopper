/**
 * @typedef {"allow" | "block" | "unknown"} RouteAction
 * @typedef {{ action: RouteAction, reason: string, isFeed?: boolean }} RoutePolicy
 */

function normalizePath(pathname) {
  const raw = String(pathname || "");
  return raw.startsWith("/") ? raw : `/${raw}`;
}

function splitPath(pathname) {
  return normalizePath(pathname).toLowerCase().split("/").filter(Boolean);
}

function hasPrefix(pathname, prefix) {
  return normalizePath(pathname).toLowerCase().startsWith(prefix);
}

/**
 * @param {string} pathname
 * @returns {RoutePolicy}
 */
function classifyYouTube(pathname) {
  const parts = splitPath(pathname);

  if (parts[0] === "feed" && parts[1] === "shorts") {
    return { action: "block", reason: "shorts_feed", isFeed: true };
  }
  if (parts[0] === "shorts") {
    return { action: "block", reason: "shorts_surface", isFeed: true };
  }
  if (parts[0]?.startsWith("@") && parts[1] === "shorts") {
    return { action: "block", reason: "channel_shorts_tab", isFeed: true };
  }
  if ((parts[0] === "channel" || parts[0] === "c" || parts[0] === "user") && parts[2] === "shorts") {
    return { action: "block", reason: "channel_shorts_tab", isFeed: true };
  }

  const allowPrefixes = [
    "/results",
    "/watch",
    "/playlist",
    "/channel/",
    "/c/",
    "/user/",
    "/@",
    "/post/"
  ];
  if (allowPrefixes.some((prefix) => hasPrefix(pathname, prefix))) {
    return { action: "allow", reason: "explicit_allow" };
  }

  return { action: "allow", reason: "non_shorts" };
}

const IG_RESERVED = new Set([
  "reel",
  "reels",
  "p",
  "explore",
  "accounts",
  "direct",
  "stories",
  "tv",
  "tags",
  "locations"
]);

/**
 * @param {string[]} parts
 */
function isInstagramProfilePath(parts) {
  if (!parts.length) return false;
  if (IG_RESERVED.has(parts[0])) return false;
  if (parts.length === 1) return true;
  return parts[1] !== "reels";
}

/**
 * @param {string} pathname
 * @returns {RoutePolicy}
 */
function classifyInstagram(pathname) {
  const parts = splitPath(pathname);

  if (!parts.length) return { action: "allow", reason: "landing" };

  if (parts[0] === "reels") {
    return { action: "block", reason: "reels_feed", isFeed: true };
  }
  if (parts[0] === "reel") {
    return { action: "block", reason: "reel", isFeed: true };
  }
  if (parts[0] === "explore" && parts[1] === "reels") {
    return { action: "block", reason: "explore_reels", isFeed: true };
  }
  if (!IG_RESERVED.has(parts[0]) && parts[1] === "reels") {
    return { action: "block", reason: "profile_reels_tab", isFeed: true };
  }

  if (parts[0] === "p") return { action: "allow", reason: "post" };
  if (parts[0] === "explore") return { action: "allow", reason: "explore" };
  if (parts[0] === "search") return { action: "allow", reason: "search" };
  if (parts[0] === "accounts") return { action: "allow", reason: "accounts" };
  if (parts[0] === "direct") return { action: "allow", reason: "direct" };
  if (isInstagramProfilePath(parts)) return { action: "allow", reason: "profile" };

  return { action: "allow", reason: "non_reels" };
}

/**
 * @param {string} siteId
 * @param {string} url
 * @returns {RoutePolicy}
 */
export function classifyRoute(siteId, url) {
  let pathname = "/";
  try {
    pathname = new URL(url).pathname || "/";
  } catch {
    pathname = "/";
  }

  if (siteId === "youtube") return classifyYouTube(pathname);
  if (siteId === "instagram") return classifyInstagram(pathname);

  return { action: "unknown", reason: "no_policy" };
}
