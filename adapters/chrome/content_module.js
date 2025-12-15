import { DEFAULT_SETTINGS } from "../../core/config.js";
import { channelKeyFromDom, channelKeyFromUrl, shouldAttemptDomChannelKey } from "../../core/channel.js";
import { resolveEffectiveSettings } from "../../core/policy.js";
import { parseShortsPath } from "../../core/shorts.js";
import { getSettings } from "./storage.js";

function getCurrentChannelKey() {
  const urlKey = channelKeyFromUrl(location.href);
  if (urlKey) return urlKey;
  if (!shouldAttemptDomChannelKey(location.pathname)) return null;
  return channelKeyFromDom(document);
}

function needsChannel(settings) {
  return (
    !!settings.whitelistMode ||
    (settings.channelOverrides && Object.keys(settings.channelOverrides).length > 0)
  );
}

async function getChannelKeyWithOptionalWait(settings) {
  let channelKey = getCurrentChannelKey();
  if (!channelKey && needsChannel(settings) && shouldAttemptDomChannelKey(location.pathname)) {
    await new Promise((r) => setTimeout(r, 120));
    channelKey = getCurrentChannelKey();
  }
  return channelKey;
}

function bumpBlocked(amount, channelKey) {
  chrome.runtime.sendMessage({ type: "ns.bumpBlocked", amount, channelKey });
}

function gateRedirect(tag, ms = 900) {
  try {
    const k = `ns_redirect_gate_${tag}`;
    const now = Date.now();
    const last = Number(sessionStorage.getItem(k) || "0");
    if (now - last < ms) return false;
    sessionStorage.setItem(k, String(now));
    return true;
  } catch {
    return true;
  }
}

function hardHidePage() {
  try {
    document.documentElement.setAttribute("data-ns-preblock", "true");
    document.documentElement.style.setProperty("visibility", "hidden", "important");
  } catch {}
}

function unhidePage() {
  try {
    document.documentElement.removeAttribute("data-ns-preblock");
    document.documentElement.style.removeProperty("visibility");
  } catch {}
}

function setRootFlags(effective) {
  const root = document.documentElement;
  root.setAttribute("data-ns-enabled", String(!!effective.enabled));
  root.setAttribute("data-ns-hide-shelves", String(!!effective.hideShelves));
  root.setAttribute("data-ns-hide-links", String(!!effective.hideLinks));
  root.setAttribute("data-ns-hide-sidebar", String(!!effective.hideSidebarEntry));
  root.setAttribute("data-ns-hide-channel-tab", String(!!effective.hideChannelShortsTab));
}

function hideShortsLinksOnce(rootEl, effective) {
  if (!effective.enabled || !effective.hideLinks) return;

  const links = rootEl.querySelectorAll?.('a[href^="/shorts/"],a[href^="/feed/shorts"]') || [];
  let hiddenNow = 0;

  links.forEach((a) => {
    const card =
      a.closest(
        "ytd-rich-item-renderer,ytd-video-renderer,ytd-grid-video-renderer,ytd-compact-video-renderer"
      ) || a;

    if (card.dataset.nsCounted === "1") return;
    card.dataset.nsCounted = "1";
    card.style.setProperty("display", "none", "important");
    hiddenNow++;
  });

  if (hiddenNow > 0) bumpBlocked(hiddenNow, effective.__channelKey || null);
}

function currentWatchVideoId() {
  try {
    if (location.pathname !== "/watch") return null;
    return new URLSearchParams(location.search).get("v") || null;
  } catch {
    return null;
  }
}

function watchLooksLikeShort() {
  const flexy = document.querySelector("ytd-watch-flexy");
  if (
    flexy &&
    (flexy.hasAttribute("is-shorts") ||
      flexy.hasAttribute("is-shorts_") ||
      flexy.getAttribute("is-shorts") === "true")
  ) {
    return true;
  }

  const player = document.getElementById("player");
  if (!player) return false;

  return !!player.querySelector(
    "ytd-reel-video-renderer,ytd-reel-player-overlay-renderer,ytd-shorts-player-renderer"
  );
}

async function contentRedirectIfShorts(effective) {
  if (!effective.enabled) return;
  if (!effective.redirectShorts) return;

  const isStrict = !!effective.strictRedirect && !effective.whitelistMode;
  if (!isStrict && !effective.__redirectEnabled) return;

  const parsed = parseShortsPath(location.pathname);
  if (!parsed.isShorts) return;

  hardHidePage();

  if (!parsed.id) {
    if (!gateRedirect("shorts_feed")) return;
    bumpBlocked(1, effective.__channelKey || null);
    location.replace("/");
    return;
  }

  if (effective.whitelistMode && !effective.__channelKey) return;

  const key = `ns_redirected_${parsed.id}`;
  if (sessionStorage.getItem(key)) return;
  sessionStorage.setItem(key, "1");

  bumpBlocked(1, effective.__channelKey || null);
  location.replace("/");
}

async function redirectIfWatchIsShort(effective) {
  if (!effective.enabled) return false;
  if (!effective.redirectShorts) return false;
  if (location.pathname !== "/watch") return false;

  const isStrict = !!effective.strictRedirect && !effective.whitelistMode;
  if (!isStrict && !effective.__redirectEnabled) return false;

  const vid = currentWatchVideoId();
  if (!vid) return false;
  if (!watchLooksLikeShort()) return false;

  const k = `ns_watch_redirected_${vid}`;
  if (sessionStorage.getItem(k)) return true;
  sessionStorage.setItem(k, "1");

  hardHidePage();
  bumpBlocked(1, effective.__channelKey || null);
  location.replace("/");
  return true;
}

function parseShortsHref(rawHref) {
  try {
    const u = new URL(rawHref, location.origin);
    const parsed = parseShortsPath(u.pathname);
    if (!parsed.isShorts) return null;
    return { id: parsed.id, kind: parsed.kind };
  } catch {
    return null;
  }
}

function installClickBlocker(getEffective) {
  function onClick(e) {
    const eff = getEffective();
    if (!eff) return;
    if (!eff.enabled || !eff.redirectShorts) return;

    const a = e.target?.closest?.('a[href]');
    if (!a) return;

    const parsed = parseShortsHref(a.getAttribute("href") || "");
    if (!parsed) return;

    const isStrict = !!eff.strictRedirect && !eff.whitelistMode;
    if (!isStrict && !eff.__redirectEnabled) return;

    e.preventDefault();
    e.stopImmediatePropagation();
    hardHidePage();

    if (!parsed.id) {
      if (gateRedirect("click_shorts_feed")) bumpBlocked(1, eff.__channelKey || null);
      location.assign("/");
      return;
    }

    const key = `ns_redirected_${parsed.id}`;
    if (!sessionStorage.getItem(key)) {
      sessionStorage.setItem(key, "1");
      bumpBlocked(1, eff.__channelKey || null);
    }

    location.assign("/");
  }

  document.addEventListener("click", onClick, true);
  document.addEventListener("auxclick", (e) => (e.button === 1 ? onClick(e) : null), true);
}

function hookSpaNavigation(onNav) {
  const _push = history.pushState;
  const _replace = history.replaceState;

  history.pushState = function (...args) {
    _push.apply(this, args);
    onNav();
  };
  history.replaceState = function (...args) {
    _replace.apply(this, args);
    onNav();
  };

  window.addEventListener("popstate", onNav);
  window.addEventListener("yt-navigate-start", onNav, true);
  window.addEventListener("yt-navigate-finish", onNav, true);
  window.addEventListener("yt-page-data-updated", onNav, true);
}

function watchUrlChanges(onNav) {
  let last = location.href;
  setInterval(() => {
    if (location.href === last) return;
    last = location.href;
    onNav();
  }, 120);
}

let settings = { ...DEFAULT_SETTINGS };
let effective = null;

async function applyAll() {
  const isShortsNow = parseShortsPath(location.pathname).isShorts;
  if (isShortsNow) hardHidePage();
  else unhidePage();

  const channelKey = await getChannelKeyWithOptionalWait(settings);
  effective = resolveEffectiveSettings(settings, channelKey);
  setRootFlags(effective);

  if (isShortsNow && (!effective.enabled || !effective.redirectShorts)) {
    unhidePage();
    return;
  }

  await contentRedirectIfShorts(effective);
  if (await redirectIfWatchIsShort(effective)) return;

  if (!parseShortsPath(location.pathname).isShorts) unhidePage();

  hideShortsLinksOnce(document, effective);
}

export async function start() {
  if (parseShortsPath(location.pathname).isShorts) hardHidePage();

  try {
    settings = await getSettings();
  } catch {
    settings = { ...DEFAULT_SETTINGS };
  }

  await applyAll();

  hookSpaNavigation(() => applyAll());
  watchUrlChanges(() => applyAll());
  installClickBlocker(() => effective);

  chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area !== "sync") return;
    settings = await getSettings();
    await applyAll();
  });

  const obs = new MutationObserver((mutations) => {
    if (!effective?.enabled) return;
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        hideShortsLinksOnce(node, effective);
      }
    }

    if (location.pathname === "/watch") redirectIfWatchIsShort(effective);
  });

  obs.observe(document.documentElement, { childList: true, subtree: true });

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    (async () => {
      if (!msg?.type) return;

      if (msg.type === "ns.getChannelKey") {
        sendResponse({ ok: true, channelKey: getCurrentChannelKey() || null });
        return;
      }

      if (msg.type === "ns.getEffective") {
        if (!effective) await applyAll();
        sendResponse({ ok: true, effective });
        return;
      }

      if (msg.type === "ns.reapply") {
        await applyAll();
        sendResponse({ ok: true });
        return;
      }
    })();

    return true;
  });
}
