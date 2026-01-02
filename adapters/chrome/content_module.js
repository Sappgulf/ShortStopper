import { DEFAULT_SETTINGS } from "../../storage/settings.js";
import { channelKeyFromDom, channelKeyFromUrl, shouldAttemptDomChannelKey } from "../../runtime/channel.js";
import { createDebounced, hookSpaNavigation, watchUrlChanges } from "../../runtime/navigation.js";
import { createRouteCache } from "../../runtime/route_cache.js";
import { createBlockGate, createBypassManager } from "../../runtime/session_state.js";
import { debugLog } from "../../runtime/debug.js";
import { resolveRoutePolicy, shouldBlockRoute, isSafeRedirectTarget } from "../../policy/decision.js";
import { getSiteConfig, siteFromHost } from "../../policy/shortform.js";
import { isSiteEnabled, resolveEffectiveSettings } from "../../policy/settings_policy.js";
import { hardHidePage, unhidePage } from "../../ui/page_visibility.js";
import { clearBlockOverlay, showBlockOverlay } from "../../ui/overlay.js";
import { setRootFlags } from "../../ui/root_flags.js";
import {
  addRuntimeMessageListener,
  addStorageChangeListener,
  getRuntimeId,
  sendRuntimeMessage
} from "../../platform/chrome.js";
import { CONTENT_MESSAGE_TYPES, getMessageType } from "../../platform/messages.js";
import { getSettings } from "./storage.js";

// ============================================================================
// CONSTANTS
// ============================================================================

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
  pinterest: ['a[href^="/watch"]', 'a[href*="pinterest.com/watch"]'],
  tiktok: [
    'a[href*="/video/"]',
    'a[href*="tiktok.com/@"]' // Catches user profiles too, but policy check will sort it out
  ]
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
    entrySelectors: [
      "ytd-guide-entry-renderer",
      "ytd-mini-guide-entry-renderer",
      "ytd-guide-section-renderer",
      "tp-yt-paper-item"
    ],
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
const MUTATION_BATCH_MS = 50;

// ============================================================================
// STATE
// ============================================================================

const blockGate = createBlockGate(BLOCK_REPEAT_MS);
const bypassManager = createBypassManager();
const routeCache = createRouteCache({ ttlMs: 1500, maxEntries: 48 });

let settings = { ...DEFAULT_SETTINGS };
let effective = null;
let navToken = 0;
let linkObserver = null;
let scheduleRouteCheck = null;
let lastVideoId = null;
let lastVideoSite = null;
let pendingMutations = [];
let mutationFlushTimer = null;

// ============================================================================
// HELPERS
// ============================================================================

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

// ============================================================================
// LINK HIDING (Batched)
// ============================================================================

function processMutationBatch() {
  if (!pendingMutations.length) return;
  if (!effective?.enabled) {
    pendingMutations.length = 0;
    return;
  }

  const canHideLinks = !!effective.hideLinks;
  const canRename = !!NAV_LABEL_RULES[effective.__siteId];

  if (!canHideLinks && !canRename) {
    pendingMutations.length = 0;
    return;
  }

  // Dedupe nodes
  const nodes = new Set();
  for (const node of pendingMutations) {
    if (node instanceof HTMLElement) nodes.add(node);
  }
  pendingMutations.length = 0;

  for (const node of nodes) {
    if (canHideLinks) hideShortFormLinksOnce(node, effective);
    if (canRename) renameShortFormLabelsOnce(node, effective);
  }
}

function scheduleMutationFlush() {
  if (mutationFlushTimer) return;
  mutationFlushTimer = setTimeout(() => {
    mutationFlushTimer = null;
    processMutationBatch();
  }, MUTATION_BATCH_MS);
}

function hideShortFormLinksOnce(rootEl, effective) {
  if (!effective.enabled || !effective.hideLinks) return;

  const siteId = effective.__siteId;
  const selectors = SITE_LINK_SELECTORS[siteId];
  if (!selectors || !selectors.length) return;

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

  // Check aria-label on root
  const aria = root.getAttribute("aria-label");
  if (aria && aria.trim().toLowerCase() === target) {
    root.setAttribute("aria-label", replacementText);
    did = true;
  }

  // Check title attribute
  const title = root.getAttribute("title");
  if (title && title.trim().toLowerCase() === target) {
    root.setAttribute("title", replacementText);
    did = true;
  }

  // Check anchor elements
  const anchor = root.tagName === "A" ? root : root.querySelector("a");
  if (anchor) {
    const anchorAria = anchor.getAttribute("aria-label");
    if (anchorAria && anchorAria.trim().toLowerCase() === target) {
      anchor.setAttribute("aria-label", replacementText);
      did = true;
    }
    const anchorTitle = anchor.getAttribute("title");
    if (anchorTitle && anchorTitle.trim().toLowerCase() === target) {
      anchor.setAttribute("title", replacementText);
      did = true;
    }
  }

  // Check text nodes in common elements - be more thorough
  const textSelectors = [
    "yt-formatted-string",
    "span",
    "div",
    "p",
    "a",
    "yt-icon-shape + span", // YouTube's new icon+label pattern
    "[class*='title']",
    "[class*='label']"
  ];
  const nodes = root.querySelectorAll(textSelectors.join(","));
  nodes.forEach((node) => {
    // Only replace if this node's direct text content matches
    // Avoid replacing parent nodes that contain matching children
    const directText = getDirectTextContent(node);
    if (directText && directText.toLowerCase() === target) {
      // Replace only the text node, not child elements
      for (const child of node.childNodes) {
        if (child.nodeType === Node.TEXT_NODE) {
          const trimmed = child.textContent?.trim().toLowerCase();
          if (trimmed === target) {
            child.textContent = replacementText;
            did = true;
          }
        }
      }
    }
    // Fallback: if no text nodes but textContent matches
    if (!did) {
      const text = node.textContent ? node.textContent.trim() : "";
      if (text && text.toLowerCase() === target && node.children.length === 0) {
        node.textContent = replacementText;
        did = true;
      }
    }
  });

  if (did) root.dataset.nsRenamed = "1";
  return did;
}

function getDirectTextContent(node) {
  let text = "";
  for (const child of node.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      text += child.textContent || "";
    }
  }
  return text.trim();
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

// ============================================================================
// VIDEO CONTEXT (for adblock insights)
// ============================================================================

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

// ============================================================================
// MUTATION OBSERVER
// ============================================================================

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
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node instanceof HTMLElement) {
          pendingMutations.push(node);
        }
      }
    }
    if (pendingMutations.length > 0) {
      scheduleMutationFlush();
    }
  });

  // Observe body instead of documentElement for better performance
  const target = document.body || document.documentElement;
  linkObserver.observe(target, { childList: true, subtree: true });
}

// ============================================================================
// MAIN APPLY LOGIC
// ============================================================================

function showBlockedOverlay(siteId) {
  const label = getSiteConfig(siteId)?.label || "Short-form";
  showBlockOverlay({
    label,
    onBack: () => {
      try {
        history.back();
      } catch {
        location.href = `${location.origin}/`;
      }
    },
    onAllowOnce: () => {
      enableBypass(siteId);
    },
    onOptions: () => {
      sendRuntimeMessage({ type: "ns.openOptions" });
    }
  });
}

async function applyAll() {
  const token = ++navToken;
  const siteId = getSiteId();

  if (!siteId) {
    effective = null;
    setObserverActive(false);
    clearBlockOverlay();
    unhidePage();
    return;
  }

  // Check bypass first
  if (bypassManager.isActive(siteId)) {
    effective = { enabled: false, __siteId: siteId, __bypassed: true };
    setRootFlags(effective);
    setObserverActive(false);
    clearBlockOverlay();
    unhidePage();
    debugLog("bypassed", { siteId, remaining: bypassManager.getRemainingMs(siteId) });
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

  renameShortFormLabelsOnce(document, effective);

  if (!effective.enabled) {
    setObserverActive(false);
    clearBlockOverlay();
    unhidePage();
    return;
  }

  const decision = shouldBlockRoute(effective, policy, siteId, location.href);

  if (decision.block) {
    // Determine redirect target
    let redirectUrl = decision.redirectUrl;

    // If no conversion URL, fall back to site home
    if (!redirectUrl) {
      const site = getSiteConfig(siteId);
      redirectUrl = site?.home ? new URL(site.home, location.origin).href : `${location.origin}/`;
    }

    // Verify the redirect target is safe
    if (!isSafeRedirectTarget(siteId, redirectUrl)) {
      redirectUrl = `${location.origin}/`;
    }

    // Check redirect loop protection
    if (!blockGate.canRedirect(location.href, redirectUrl)) {
      debugLog("redirect_blocked", { reason: "loop_protection", from: location.href, to: redirectUrl });
      hardHidePage();
      setObserverActive(false);
      showBlockedOverlay(siteId);
      return;
    }

    hardHidePage();
    setObserverActive(false);

    if (blockGate.shouldCount(location.href)) {
      bumpBlocked(1, effective.__statsKey || null);
    }

    debugLog("blocked", { siteId, reason: decision.reason, url: location.href, redirectTo: redirectUrl });

    if (location.href !== redirectUrl) {
      clearBlockOverlay();
      location.replace(redirectUrl);
    } else {
      showBlockedOverlay(siteId);
    }
    return;
  }

  clearBlockOverlay();
  unhidePage();
  hideShortFormLinksOnce(document, effective);
  setObserverActive(!!effective.hideLinks || !!NAV_LABEL_RULES[effective.__siteId]);

  debugLog("allowed", { siteId, reason: decision.reason, url: location.href });
}

// ============================================================================
// DELAYED LABEL RENAME (for async-loaded sidebars)
// ============================================================================

let labelRenameAttempts = 0;
const MAX_LABEL_RENAME_ATTEMPTS = 10;
const LABEL_RENAME_DELAYS = [100, 300, 500, 1000, 1500, 2000, 3000, 4000, 5000, 7000];

function scheduleDelayedLabelRename() {
  labelRenameAttempts = 0;
  attemptLabelRename();
}

function attemptLabelRename() {
  if (labelRenameAttempts >= MAX_LABEL_RENAME_ATTEMPTS) return;
  if (!effective?.enabled) return;

  const delay = LABEL_RENAME_DELAYS[labelRenameAttempts] || 1000;
  labelRenameAttempts++;

  setTimeout(() => {
    if (!effective?.enabled) return;

    // Try to rename labels on the entire document
    const siteId = effective.__siteId;
    if (!siteId) return;

    const rule = NAV_LABEL_RULES[siteId];
    if (!rule) return;

    let foundAny = false;

    // Check if sidebar is loaded
    if (rule.entrySelectors?.length) {
      const selector = rule.entrySelectors.join(",");
      const entries = document.querySelectorAll(selector);
      entries.forEach((entry) => {
        if (entry.dataset.nsRenamed === "1") return;
        const anchor = entry.querySelector?.("a[href]");
        if (rule.hrefIncludes?.length && anchor && !anchorMatchesHref(anchor, rule.hrefIncludes)) return;
        if (replaceLabelText(entry, rule.label, rule.replacement)) {
          foundAny = true;
        }
      });
    }

    // Continue trying if we haven't found/renamed anything yet
    if (!foundAny && labelRenameAttempts < MAX_LABEL_RENAME_ATTEMPTS) {
      attemptLabelRename();
    }
  }, delay);
}

// ============================================================================
// BYPASS CONTROLS
// ============================================================================

function enableBypass(siteId, durationMs = 10 * 60 * 1000) {
  bypassManager.enable(siteId, durationMs);
  blockGate.clearHistory();
  applyAll();
}

function disableBypass(siteId) {
  bypassManager.disable(siteId);
  applyAll();
}

// ============================================================================
// ENTRY POINT
// ============================================================================

export async function start() {
  const siteId = getSiteId();
  if (siteId) {
    const policy = getPolicyForUrl(siteId, location.href, location.pathname);
    if (policy.action === "block" && !bypassManager.isActive(siteId)) {
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

  // YouTube loads sidebar asynchronously - schedule delayed label checks
  if (siteId === "youtube") {
    scheduleDelayedLabelRename();
  }

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

      if (type === "ns.enableBypass") {
        const duration = typeof msg.duration === "number" ? msg.duration : 10 * 60 * 1000;
        enableBypass(getSiteId(), duration);
        sendResponse({ ok: true });
        return;
      }

      if (type === "ns.disableBypass") {
        disableBypass(getSiteId());
        sendResponse({ ok: true });
        return;
      }

      if (type === "ns.getBypassStatus") {
        const siteId = getSiteId();
        sendResponse({
          ok: true,
          active: bypassManager.isActive(siteId),
          remainingMs: bypassManager.getRemainingMs(siteId)
        });
        return;
      }
    })();

    return true;
  });
}
