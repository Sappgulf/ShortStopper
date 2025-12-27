/**
 * @typedef {"allow" | "block" | "unknown"} RouteAction
 * @typedef {{ action: RouteAction, reason: string, isFeed?: boolean, convertUrl?: string }} RoutePolicy
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
 * Extract video ID from YouTube Shorts URL for conversion to watch URL
 * @param {string} pathname
 * @returns {string | null}
 */
function extractShortsVideoId(pathname) {
  const rawParts = normalizePath(pathname).split("/").filter(Boolean);
  if (rawParts[0]?.toLowerCase() === "shorts" && rawParts[1]) {
    // /shorts/VIDEO_ID or /shorts/VIDEO_ID?...
    const videoId = rawParts[1].split("?")[0].split("#")[0];
    // YouTube video IDs are 11 characters, alphanumeric with - and _
    if (/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
      return videoId;
    }
  }
  return null;
}

/**
 * @param {string} pathname
 * @returns {RoutePolicy}
 */
function classifyYouTube(pathname) {
  const parts = splitPath(pathname);

  // Shorts feed - no conversion possible
  if (parts[0] === "feed" && parts[1] === "shorts") {
    return { action: "block", reason: "shorts_feed", isFeed: true };
  }

  // Individual Short - can convert to watch URL
  if (parts[0] === "shorts") {
    const videoId = extractShortsVideoId(pathname);
    if (videoId) {
      return {
        action: "block",
        reason: "shorts_video",
        isFeed: false,
        convertUrl: `/watch?v=${videoId}`
      };
    }
    return { action: "block", reason: "shorts_surface", isFeed: true };
  }

  // Channel Shorts tab
  if (parts[0]?.startsWith("@") && parts[1] === "shorts") {
    return { action: "block", reason: "channel_shorts_tab", isFeed: true };
  }
  if ((parts[0] === "channel" || parts[0] === "c" || parts[0] === "user") && parts[2] === "shorts") {
    return { action: "block", reason: "channel_shorts_tab", isFeed: true };
  }

  // Explicit allow list - these should never be blocked
  const allowPrefixes = [
    "/results",
    "/watch",
    "/playlist",
    "/channel/",
    "/c/",
    "/user/",
    "/@",
    "/post/",
    "/feed/subscriptions",
    "/feed/history",
    "/feed/library",
    "/feed/trending",
    "/gaming",
    "/music",
    "/premium"
  ];
  if (allowPrefixes.some((prefix) => hasPrefix(pathname, prefix))) {
    return { action: "allow", reason: "explicit_allow" };
  }

  // Home page - allow
  if (parts.length === 0 || pathname === "/") {
    return { action: "allow", reason: "home" };
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
 * @param {string} pathname
 * @returns {RoutePolicy}
 */
function classifyFacebook(pathname) {
  const parts = splitPath(pathname);

  if (!parts.length) return { action: "allow", reason: "landing" };

  if (parts[0] === "reels") {
    return { action: "block", reason: "reels_feed", isFeed: true };
  }
  if (parts[0] === "reel") {
    return { action: "block", reason: "reel", isFeed: true };
  }
  if (parts[0] === "watch" && parts[1] === "reels") {
    return { action: "block", reason: "watch_reels", isFeed: true };
  }

  // Explicit allows
  if (parts[0] === "watch" && parts[1] !== "reels") return { action: "allow", reason: "watch" };
  if (parts[0] === "marketplace") return { action: "allow", reason: "marketplace" };
  if (parts[0] === "groups") return { action: "allow", reason: "groups" };
  if (parts[0] === "events") return { action: "allow", reason: "events" };
  if (parts[0] === "gaming") return { action: "allow", reason: "gaming" };

  return { action: "allow", reason: "non_reels" };
}

/**
 * @param {string} pathname
 * @returns {RoutePolicy}
 */
function classifyTikTok(pathname) {
  const parts = splitPath(pathname);

  if (!parts.length) return { action: "allow", reason: "landing" };

  // TikTok's FYP (For You Page) - the main short-form feed
  if (parts[0] === "foryou" || parts[0] === "fyp") {
    return { action: "block", reason: "fyp", isFeed: true };
  }

  // Individual video pages - these are short-form by nature
  if (parts[0]?.startsWith("@") && parts[1] === "video") {
    return { action: "block", reason: "video", isFeed: false };
  }

  // Explore/discover feeds
  if (parts[0] === "explore" || parts[0] === "discover") {
    return { action: "block", reason: "explore", isFeed: true };
  }

  // Allow profile pages, search, settings
  if (parts[0]?.startsWith("@") && !parts[1]) return { action: "allow", reason: "profile" };
  if (parts[0] === "search") return { action: "allow", reason: "search" };
  if (parts[0] === "setting") return { action: "allow", reason: "settings" };
  if (parts[0] === "login" || parts[0] === "signup") return { action: "allow", reason: "auth" };

  // Default: block (TikTok is primarily short-form)
  return { action: "block", reason: "default_block", isFeed: true };
}

/**
 * @param {string} pathname
 * @returns {RoutePolicy}
 */
function classifySnapchat(pathname) {
  const parts = splitPath(pathname);

  if (!parts.length) return { action: "allow", reason: "landing" };

  if (parts[0] === "spotlight") {
    return { action: "block", reason: "spotlight", isFeed: true };
  }

  // Allow other pages
  if (parts[0] === "add") return { action: "allow", reason: "add_friend" };
  if (parts[0] === "discover") return { action: "allow", reason: "discover" };

  return { action: "allow", reason: "non_spotlight" };
}

/**
 * @param {string} pathname
 * @returns {RoutePolicy}
 */
function classifyPinterest(pathname) {
  const parts = splitPath(pathname);

  if (!parts.length) return { action: "allow", reason: "landing" };

  // Watch is Pinterest's short-form video section
  if (parts[0] === "watch") {
    return { action: "block", reason: "watch", isFeed: true };
  }

  // Allow pins, boards, profiles, search
  if (parts[0] === "pin") return { action: "allow", reason: "pin" };
  if (parts[0] === "search") return { action: "allow", reason: "search" };
  if (parts[0] === "ideas") return { action: "allow", reason: "ideas" };

  return { action: "allow", reason: "non_watch" };
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

  switch (siteId) {
    case "youtube":
      return classifyYouTube(pathname);
    case "instagram":
      return classifyInstagram(pathname);
    case "facebook":
      return classifyFacebook(pathname);
    case "tiktok":
      return classifyTikTok(pathname);
    case "snapchat":
      return classifySnapchat(pathname);
    case "pinterest":
      return classifyPinterest(pathname);
    default:
      return { action: "unknown", reason: "no_policy" };
  }
}
