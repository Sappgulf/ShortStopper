import { channelKeyFromDom, channelKeyFromUrl, shouldAttemptDomChannelKey } from "../../core/channel.js";
import { resolveEffectiveSettings } from "../../core/policy.js";
import { parseShortsPath } from "../../core/shorts.js";
import { bumpBlockedLocal, getSettings } from "./storage.js";

function getCurrentChannelKey() {
  const urlKey = channelKeyFromUrl(location.href);
  if (urlKey) return urlKey;
  if (!shouldAttemptDomChannelKey(location.pathname)) return null;
  return channelKeyFromDom(document);
}

function ensureBridgeStyles() {
  if (document.getElementById("ns-ios-bridge-style")) return;
  const style = document.createElement("style");
  style.id = "ns-ios-bridge-style";
  style.textContent = `
    :root[data-ns-ios-preblock="true"] body { display:none !important; }
    #ns-ios-note {
      position: fixed;
      z-index: 999999;
      top: 10px;
      left: 10px;
      right: 10px;
      padding: 10px 12px;
      border-radius: 14px;
      border: 1px solid rgba(127,127,127,.35);
      background: color-mix(in oklab, Canvas 92%, CanvasText);
      color: CanvasText;
      font: 14px/1.4 system-ui, -apple-system, Segoe UI, Roboto, Arial;
      display: flex;
      gap: 10px;
      align-items: center;
      justify-content: space-between;
    }
    #ns-ios-note a { color: inherit; text-decoration: underline; }
  `;
  document.documentElement.appendChild(style);
}

function showNote(text) {
  ensureBridgeStyles();
  let el = document.getElementById("ns-ios-note");
  if (!el) {
    el = document.createElement("div");
    el.id = "ns-ios-note";
    document.documentElement.appendChild(el);
  }
  el.innerHTML = `<span>${text}</span><a href="/">Go Home</a>`;
}

function applyHideCssFlags(effective) {
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

  if (hiddenNow > 0) bumpBlockedLocal(hiddenNow, effective.__channelKey || null);
}

function hardHidePage() {
  document.documentElement.setAttribute("data-ns-ios-preblock", "true");
}

function unhidePage() {
  document.documentElement.removeAttribute("data-ns-ios-preblock");
}

function shouldBlockShortsRoute(effective) {
  if (!effective.enabled) return false;
  if (!effective.redirectShorts) return false;
  return parseShortsPath(location.pathname).isShorts;
}

async function applyAll() {
  const settings = getSettings();
  const channelKey = getCurrentChannelKey();
  const effective = resolveEffectiveSettings(settings, channelKey);

  applyHideCssFlags(effective);

  const isShortsNow = parseShortsPath(location.pathname).isShorts;
  if (isShortsNow && shouldBlockShortsRoute(effective)) {
    hardHidePage();
    bumpBlockedLocal(1, effective.__channelKey || null);
    showNote("Shorts blocked on iOS (hide-only).");
    return;
  }

  unhidePage();
  hideShortsLinksOnce(document, effective);
}

export function startBridge() {
  ensureBridgeStyles();
  applyAll();

  const obs = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        applyAll();
        return;
      }
    }
  });

  obs.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("popstate", applyAll);
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  startBridge();
}

