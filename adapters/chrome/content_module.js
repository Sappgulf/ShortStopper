import { DEFAULT_SETTINGS } from "../../storage/settings.js";
import { channelKeyFromDom, channelKeyFromUrl, shouldAttemptDomChannelKey } from "../../runtime/channel.js";
import { createDebounced, hookSpaNavigation, watchUrlChanges } from "../../runtime/navigation.js";
import { createRouteCache } from "../../runtime/route_cache.js";
import { createBlockGate } from "../../runtime/session_state.js";
import { debugLog } from "../../runtime/debug.js";
import { resolveRoutePolicy, shouldBlockRoute } from "../../policy/decision.js";
import { getSiteConfig, siteFromHost } from "../../policy/shortform.js";
import { isSiteEnabled, resolveEffectiveSettings } from "../../policy/settings_policy.js";
import { hardHidePage, unhidePage } from "../../ui/page_visibility.js";
import { setRootFlags } from "../../ui/root_flags.js";
import {
  addRuntimeMessageListener,
  addStorageChangeListener,
  getRuntimeId,
  sendRuntimeMessage
} from "../../platform/chrome.js";
import { CONTENT_MESSAGE_TYPES, getMessageType } from "../../platform/messages.js";
import { getSettings } from "./storage.js";

const SITE_LINK_SELECTORS = {
  youtube: [
    'a[href^="/shorts/"]',
    'a[href^="/feed/shorts"]',
    'a[href*="youtube.com/shorts/"]',
    'a[href*="youtube.com/feed/shorts"]'
  ],
  instagram: [
    'a[href^="/reel/"]',
    'a[href^="/reels"]',
    'a[href*="instagram.com/reel/"]',
    'a[href*="instagram.com/reels"]'
  ],
  facebook: [
    'a[href^="/reel/"]',
    'a[href^="/reels"]',
    'a[href^="/watch/reels"]',
    'a[href*="facebook.com/reel/"]',
    'a[href*="facebook.com/reels"]',
    'a[href*="facebook.com/watch/reels"]'
  ],
  snapchat: ['a[href^="/spotlight"]', 'a[href*="snapchat.com/spotlight"]'],
  pinterest: ['a[href^="/watch"]', 'a[href*="pinterest.com/watch"]']
};

const SITE_CARD_SELECTORS = {
  youtube: "ytd-rich-item-renderer,ytd-video-renderer,ytd-grid-video-renderer,ytd-compact-video-renderer",
  instagram: "article,div[role='presentation']",
  facebook: "div[role='article']"
};

const SHORTS_LABEL_REPLACEMENT = "Slop";
const NAV_LABEL_RULES = {
  youtube: {
    label: "Shorts",
    replacement: SHORTS_LABEL_REPLACEMENT,
    entrySelectors: ["ytd-guide-entry-renderer", "ytd-mini-guide-entry-renderer"],
    hrefIncludes: ["/shorts", "/feed/shorts"]
  },
  instagram: {
    label: "Reels",
    replacement: SHORTS_LABEL_REPLACEMENT,
    anchorSelectors: [
      'nav a[href^="/reels"]',
      'nav a[href^="/reel/"]',
      'a[href*="instagram.com/reels"]',
      'a[href*="instagram.com/reel/"]'
    ],
    hrefIncludes: ["/reels", "/reel/"]
  },
  facebook: {
    label: "Reels",
    replacement: SHORTS_LABEL_REPLACEMENT,
    anchorSelectors: [
      'div[role="navigation"] a[href*="/reels"]',
      'div[role="navigation"] a[href*="/reel/"]',
      'div[role="navigation"] a[href*="/watch/reels"]',
      'a[href*="facebook.com/reels"]',
      'a[href*="facebook.com/reel/"]',
      'a[href*="facebook.com/watch/reels"]'
    ],
    hrefIncludes: ["/reels", "/reel/", "/watch/reels"]
  },
  snapchat: {
    label: "Spotlight",
    replacement: SHORTS_LABEL_REPLACEMENT,
    anchorSelectors: ['nav a[href*="/spotlight"]', 'a[href*="snapchat.com/spotlight"]'],
    hrefIncludes: ["/spotlight"]
  },
  pinterest: {
    label: "Watch",
    replacement: SHORTS_LABEL_REPLACEMENT,
    anchorSelectors: ['nav a[href^="/watch"]', 'a[href*="pinterest.com/watch"]'],
    hrefIncludes: ["/watch"]
  }
};

const ROUTE_DEBOUNCE_MS = 90;
const BLOCK_REPEAT_MS = 900;

const blockGate = createBlockGate(BLOCK_REPEAT_MS);
const routeCache = createRouteCache({ ttlMs: 1500, maxEntries: 48 });

function getSiteId() {
  return siteFromHost(location.hostname);
}

function getCurrentChannelKey(siteId) {
  if (siteId !== "youtube") return null;
  const urlKey = channelKeyFromUrl(location.href);
  if (urlKey) return urlKey;
  if (!shouldAttemptDomChannelKey(location.pathname)) return null;
  return channelKeyFromDom(document);
}

function needsChannel(settings, siteId) {
  if (siteId !== "youtube") return false;
  return (
    !!settings.whitelistMode ||
    (settings.channelOverrides && Object.keys(settings.channelOverrides).length > 0)
  );
}

async function getChannelKeyWithOptionalWait(settings, siteId) {
  let channelKey = getCurrentChannelKey(siteId);
  if (!channelKey && needsChannel(settings, siteId) && shouldAttemptDomChannelKey(location.pathname)) {
    await new Promise((r) => setTimeout(r, 120));
    channelKey = getCurrentChannelKey(siteId);
  }
  return channelKey;
}

function bumpBlocked(amount, statsKey) {
  sendRuntimeMessage({ type: "ns.bumpBlocked", amount, channelKey: statsKey });
}

function getPolicyForUrl(siteId, url, pathname) {
  const cached = routeCache.get(url);
  if (cached) return cached;
  const policy = resolveRoutePolicy(siteId, url, pathname);
  routeCache.set(url, policy);
  return policy;
}

function hideShortFormLinksOnce(rootEl, effective) {
  if (!effective.enabled || !effective.hideLinks) return;

  const siteId = effective.__siteId;
  const selectors = SITE_LINK_SELECTORS[siteId];
  if (!selectors) return;

  const links = rootEl.querySelectorAll?.(selectors.join(",")) || [];
  if (!links.length) return;

  const cardSelector = SITE_CARD_SELECTORS[siteId] || "";
  let hiddenNow = 0;

  links.forEach((a) => {
    const raw = a.getAttribute("href") || "";
    if (!raw) return;

    let u;
    try {
      u = new URL(raw, location.origin);
    } catch {
      return;
    }

    const targetSite = siteFromHost(u.hostname);
    if (!targetSite || targetSite !== siteId) return;

    const policy = getPolicyForUrl(siteId, u.href, u.pathname);
    if (policy.action !== "block") return;

    const card = cardSelector ? a.closest(cardSelector) || a : a;
    if (card.dataset.nsCounted === "1") return;
    card.dataset.nsCounted = "1";
    card.style.setProperty("display", "none", "important");
    hiddenNow++;
  });

  if (hiddenNow > 0) bumpBlocked(hiddenNow, effective.__statsKey || null);
}

function anchorMatchesHref(anchor, includes) {
  if (!anchor || !includes?.length) return true;
  const raw = anchor.getAttribute("href") || "";
  if (!raw) return false;
  return includes.some((frag) => raw.includes(frag));
}

function replaceLabelText(root, label, replacement) {
  if (!root || root.dataset.nsRenamed === "1") return false;
  let did = false;

  const target = String(label || "").trim().toLowerCase();
  const replacementText = String(replacement || "");

  const aria = root.getAttribute("aria-label");
  if (aria && aria.trim().toLowerCase() === target) {
    root.setAttribute("aria-label", replacementText);
    did = true;
  }

  const anchor = root.tagName === "A" ? root : root.querySelector("a");
  const anchorAria = anchor?.getAttribute("aria-label");
  if (anchorAria && anchorAria.trim().toLowerCase() === target) {
    anchor.setAttribute("aria-label", replacementText);
    did = true;
  }

  const nodes = root.querySelectorAll("yt-formatted-string, span, div, p, a");
  nodes.forEach((node) => {
    const text = node.textContent ? node.textContent.trim() : "";
    if (text && text.toLowerCase() === target) {
      node.textContent = replacementText;
      did = true;
    }
  });

  if (did) root.dataset.nsRenamed = "1";
  return did;
}

function renameShortFormLabelsOnce(rootEl, effective) {
  if (!effective?.enabled || !effective.__siteId) return;
  const rule = NAV_LABEL_RULES[effective.__siteId];
  if (!rule) return;

  if (rule.entrySelectors?.length) {
    const selector = rule.entrySelectors.join(",");
    const nodes = new Set();
    if (rootEl?.matches?.(selector)) nodes.add(rootEl);
    const found = rootEl?.querySelectorAll?.(selector) || [];
    found.forEach((el) => nodes.add(el));
    if (!nodes.size) return;
    nodes.forEach((entry) => {
      const anchor = entry.querySelector?.("a[href]");
      if (rule.hrefIncludes?.length && anchor && !anchorMatchesHref(anchor, rule.hrefIncludes)) return;
      replaceLabelText(entry, rule.label, rule.replacement);
    });
    return;
  }

  const selector = rule.anchorSelectors?.join(",") || "";
  if (!selector) return;
  const nodes = new Set();
  if (rootEl?.matches?.(selector)) nodes.add(rootEl);
  const found = rootEl?.querySelectorAll?.(selector) || [];
  found.forEach((el) => nodes.add(el));
  if (!nodes.size) return;
  nodes.forEach((anchor) => {
    if (!anchorMatchesHref(anchor, rule.hrefIncludes)) return;
    replaceLabelText(anchor, rule.label, rule.replacement);
  });
}

let settings = { ...DEFAULT_SETTINGS };
let effective = null;
let navToken = 0;
let linkObserver = null;
let scheduleRouteCheck = null;
let lastVideoId = null;
let lastVideoSite = null;

function getYouTubeVideoContext() {
  if (location.pathname !== "/watch") return { videoId: null, title: null };
  const params = new URLSearchParams(location.search);
  const videoId = params.get("v");
  if (!videoId) return { videoId: null, title: null };
  const title = document.title ? document.title.trim().slice(0, 80) : null;
  return { videoId, title };
}

function updateVideoContext(siteId) {
  if (siteId !== "youtube") {
    if (lastVideoId !== null || lastVideoSite !== siteId) {
      lastVideoId = null;
      lastVideoSite = siteId;
      sendRuntimeMessage({ type: "ns.updateVideoContext", siteId, videoId: null, title: null });
    }
    return;
  }

  const ctx = getYouTubeVideoContext();
  if (ctx.videoId === lastVideoId && lastVideoSite === siteId) return;
  lastVideoId = ctx.videoId;
  lastVideoSite = siteId;
  sendRuntimeMessage({ type: "ns.updateVideoContext", siteId, videoId: ctx.videoId, title: ctx.title });
}

function setObserverActive(active) {
  if (!active) {
    if (linkObserver) {
      linkObserver.disconnect();
      linkObserver = null;
    }
    return;
  }

  if (linkObserver) return;
  linkObserver = new MutationObserver((mutations) => {
    const canHideLinks = !!effective?.enabled && !!effective.hideLinks;
    const canRename = !!effective?.enabled && !!NAV_LABEL_RULES[effective.__siteId];
    if (!canHideLinks && !canRename) return;
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        if (canHideLinks) hideShortFormLinksOnce(node, effective);
        if (canRename) renameShortFormLabelsOnce(node, effective);
      }
    }
  });
  linkObserver.observe(document.documentElement, { childList: true, subtree: true });
}

async function applyAll() {
  const token = ++navToken;
  const siteId = getSiteId();
  if (!siteId) {
    effective = null;
    setObserverActive(false);
    unhidePage();
    return;
  }

  const policy = getPolicyForUrl(siteId, location.href, location.pathname);
  const channelKey = await getChannelKeyWithOptionalWait(settings, siteId);
  if (token !== navToken) return;

  const siteEnabled = isSiteEnabled(settings, siteId);
  const baseSettings = { ...settings, enabled: settings.enabled && siteEnabled };

  effective = resolveEffectiveSettings(baseSettings, channelKey);
  effective.__siteId = siteId;
  effective.__statsKey = channelKey || (siteId === "youtube" ? null : `site:${siteId}`);
  effective.__adblockActive = !!settings.enabled && !!settings.adBlockEnabled;
  setRootFlags(effective);

  const shouldUpdateVideoContext = settings.adblockInsights && settings.adBlockEnabled;
  if (shouldUpdateVideoContext) updateVideoContext(siteId);

  if (!effective.enabled) {
    setObserverActive(false);
    unhidePage();
    return;
  }

  const decision = shouldBlockRoute(effective, policy, siteId);
  if (decision.block) {
    const site = getSiteConfig(siteId);
    const homeUrl = site?.home ? new URL(site.home, location.origin).href : `${location.origin}/`;

    hardHidePage();
    setObserverActive(false);

    if (blockGate.shouldCount(location.href)) {
      bumpBlocked(1, effective.__statsKey || null);
    }

    debugLog("blocked", { siteId, reason: decision.reason, url: location.href });

    if (location.href !== homeUrl) {
      location.replace(homeUrl);
    } else {
      unhidePage();
    }
    return;
  }

  unhidePage();
  renameShortFormLabelsOnce(document, effective);
  hideShortFormLinksOnce(document, effective);
  setObserverActive(!!effective.hideLinks || !!NAV_LABEL_RULES[effective.__siteId]);

  debugLog("allowed", { siteId, reason: decision.reason, url: location.href });
}

export async function start() {
  const siteId = getSiteId();
  if (siteId) {
    const policy = getPolicyForUrl(siteId, location.href, location.pathname);
    if (policy.action === "block") {
      hardHidePage();
    }
  }

  try {
    settings = await getSettings();
  } catch {
    settings = { ...DEFAULT_SETTINGS };
  }

  scheduleRouteCheck = createDebounced(() => applyAll(), ROUTE_DEBOUNCE_MS);
  await applyAll();

  hookSpaNavigation(scheduleRouteCheck);
  watchUrlChanges(scheduleRouteCheck);

  addStorageChangeListener(async (changes, area) => {
    if (area !== "sync") return;
    settings = await getSettings();
    scheduleRouteCheck();
  });

  addRuntimeMessageListener((msg, sender, sendResponse) => {
    (async () => {
      if (!sender?.id || sender.id !== getRuntimeId()) return;
      const type = getMessageType(msg, CONTENT_MESSAGE_TYPES);
      if (!type) return;

      if (type === "ns.getChannelKey") {
        sendResponse({ ok: true, channelKey: getCurrentChannelKey(getSiteId()) || null });
        return;
      }

      if (type === "ns.getEffective") {
        if (!effective) await applyAll();
        sendResponse({ ok: true, effective });
        return;
      }

      if (type === "ns.reapply") {
        await applyAll();
        sendResponse({ ok: true });
        return;
      }
    })();

    return true;
  });
}
