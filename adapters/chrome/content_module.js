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
    if (!effective?.enabled || !effective.hideLinks) return;
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        hideShortFormLinksOnce(node, effective);
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
  hideShortFormLinksOnce(document, effective);
  setObserverActive(!!effective.hideLinks);

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
