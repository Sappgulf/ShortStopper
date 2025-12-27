import { parseShortsPath } from "./shorts.js";

/**
 * @typedef {Object} SiteConfig
 * @property {string} id
 * @property {string} label
 * @property {string} home
 * @property {string[]} domains
 */

function hostMatches(host, domain) {
  return host === domain || host.endsWith(`.${domain}`);
}

function normalizePath(pathname) {
  const p = String(pathname || "");
  return p.startsWith("/") ? p : `/${p}`;
}

function parseInstagramPath(pathname) {
  const p = normalizePath(pathname);
  const parts = p.split("/").filter(Boolean);
  if (!parts.length) return { isShortForm: false, id: null, kind: "" };

  if (parts[0] === "reels") return { isShortForm: true, id: null, kind: "reels_feed" };
  if (parts[0] === "reel") return { isShortForm: true, id: parts[1] || null, kind: "reel" };
  if (parts[0] === "explore" && parts[1] === "reels") return { isShortForm: true, id: null, kind: "explore_reels" };
  return { isShortForm: false, id: null, kind: "" };
}

function parseFacebookPath(pathname) {
  const p = normalizePath(pathname);
  const parts = p.split("/").filter(Boolean);
  if (!parts.length) return { isShortForm: false, id: null, kind: "" };

  if (parts[0] === "reels") return { isShortForm: true, id: null, kind: "reels_feed" };
  if (parts[0] === "reel") return { isShortForm: true, id: parts[1] || null, kind: "reel" };
  if (parts[0] === "watch" && parts[1] === "reels") {
    return { isShortForm: true, id: parts[2] || null, kind: "watch_reels" };
  }
  return { isShortForm: false, id: null, kind: "" };
}

function parseTikTokPath(pathname) {
  const p = normalizePath(pathname);
  const parts = p.split("/").filter(Boolean);
  if (!parts.length) return { isShortForm: false, id: null, kind: "" };

  // FYP is short-form
  if (parts[0] === "foryou" || parts[0] === "fyp") {
    return { isShortForm: true, id: null, kind: "fyp" };
  }
  
  // Individual videos are short-form
  if (parts[0]?.startsWith("@") && parts[1] === "video") {
    return { isShortForm: true, id: parts[2] || null, kind: "video" };
  }
  
  // Explore/discover
  if (parts[0] === "explore" || parts[0] === "discover") {
    return { isShortForm: true, id: null, kind: "explore" };
  }
  
  // Profile pages, search, settings are NOT short-form
  if (parts[0]?.startsWith("@") && !parts[1]) {
    return { isShortForm: false, id: null, kind: "" };
  }
  if (parts[0] === "search" || parts[0] === "setting" || parts[0] === "login" || parts[0] === "signup") {
    return { isShortForm: false, id: null, kind: "" };
  }

  // Default: treat as short-form (TikTok is primarily short-form)
  return { isShortForm: true, id: null, kind: "default" };
}

function parseSnapchatPath(pathname) {
  const p = normalizePath(pathname);
  const parts = p.split("/").filter(Boolean);
  if (!parts.length) return { isShortForm: false, id: null, kind: "" };

  if (parts[0] === "spotlight") return { isShortForm: true, id: parts[1] || null, kind: "spotlight" };
  return { isShortForm: false, id: null, kind: "" };
}

function parsePinterestPath(pathname) {
  const p = normalizePath(pathname);
  const parts = p.split("/").filter(Boolean);
  if (!parts.length) return { isShortForm: false, id: null, kind: "" };

  if (parts[0] === "watch") return { isShortForm: true, id: parts[1] || null, kind: "watch" };
  return { isShortForm: false, id: null, kind: "" };
}

/** @type {Record<string, SiteConfig>} */
export const SHORTFORM_SITES = {
  youtube: {
    id: "youtube",
    label: "YouTube Shorts",
    home: "https://www.youtube.com/",
    domains: ["youtube.com"]
  },
  instagram: {
    id: "instagram",
    label: "Instagram Reels",
    home: "https://www.instagram.com/",
    domains: ["instagram.com"]
  },
  facebook: {
    id: "facebook",
    label: "Facebook Reels",
    home: "https://www.facebook.com/",
    domains: ["facebook.com"]
  },
  tiktok: {
    id: "tiktok",
    label: "TikTok",
    home: "https://www.tiktok.com/",
    domains: ["tiktok.com"]
  },
  snapchat: {
    id: "snapchat",
    label: "Snapchat Spotlight",
    home: "https://www.snapchat.com/",
    domains: ["snapchat.com"]
  },
  pinterest: {
    id: "pinterest",
    label: "Pinterest Watch",
    home: "https://www.pinterest.com/",
    domains: ["pinterest.com"]
  }
};

export function siteFromHost(host) {
  const h = String(host || "").toLowerCase();
  for (const site of Object.values(SHORTFORM_SITES)) {
    for (const domain of site.domains) {
      if (hostMatches(h, domain)) return site.id;
    }
  }
  return null;
}

export function getSiteConfig(siteId) {
  return SHORTFORM_SITES[siteId] || null;
}

export function parseShortFormPath(siteId, pathname) {
  switch (siteId) {
    case "youtube":
      {
        const parsed = parseShortsPath(pathname);
        return { isShortForm: !!parsed.isShorts, id: parsed.id, kind: parsed.kind };
      }
    case "instagram":
      return parseInstagramPath(pathname);
    case "facebook":
      return parseFacebookPath(pathname);
    case "tiktok":
      return parseTikTokPath(pathname);
    case "snapchat":
      return parseSnapchatPath(pathname);
    case "pinterest":
      return parsePinterestPath(pathname);
    default:
      return { isShortForm: false, id: null, kind: "" };
  }
}

export function parseShortFormUrl(url) {
  try {
    const u = new URL(url);
    const siteId = siteFromHost(u.hostname);
    if (!siteId) return { siteId: null, isShortForm: false, id: null, kind: "" };
    const parsed = parseShortFormPath(siteId, u.pathname);
    return { siteId, ...parsed };
  } catch {
    return { siteId: null, isShortForm: false, id: null, kind: "" };
  }
}
