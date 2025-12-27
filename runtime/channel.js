/**
 * @param {string | null | undefined} k
 */
export function normalizeKey(k) {
  return String(k || "").trim().toLowerCase();
}

/**
 * @param {string} url
 * @returns {string | null}
 */
export function channelKeyFromUrl(url) {
  try {
    const u = new URL(url);
    const p = u.pathname.split("/").filter(Boolean);

    if (p[0]?.startsWith("@")) return p[0].toLowerCase();
    if (p[0] === "channel" && p[1]) return p[1];
    if (p[0] === "c" && p[1]) return `c/${p[1].toLowerCase()}`;
    if (p[0] === "user" && p[1]) return `user/${p[1].toLowerCase()}`;
  } catch {}
  return null;
}

/**
 * @param {string} pathname
 */
export function shouldAttemptDomChannelKey(pathname) {
  const p = String(pathname || "");
  return p === "/watch" || p.startsWith("/shorts");
}

/**
 * @param {Document | HTMLElement} root
 */
export function channelKeyFromDom(root) {
  if (!root?.querySelector) return null;

  const selectors = [
    'ytd-channel-name a[href^="/@"]',
    'ytd-channel-name a[href^="/channel/"]',
    'ytd-video-owner-renderer a[href^="/@"]',
    'ytd-video-owner-renderer a[href^="/channel/"]',
    'a.yt-simple-endpoint[href^="/@"]',
    'a.yt-simple-endpoint[href^="/channel/"]'
  ];

  for (const sel of selectors) {
    const a = root.querySelector(sel);
    const href = a?.getAttribute?.("href");
    if (!href) continue;
    const key = channelKeyFromUrl(`https://www.youtube.com${href}`);
    if (key) return key;
  }

  const meta = root.querySelector('meta[itemprop="channelId"]');
  if (meta?.content) return meta.content;

  return null;
}
