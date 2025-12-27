/**
 * @param {() => void} onNav
 */
export function hookSpaNavigation(onNav) {
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

/**
 * @param {() => void} onNav
 * @param {number} intervalMs
 */
export function watchUrlChanges(onNav, intervalMs = 120) {
  let last = location.href;
  setInterval(() => {
    if (location.href === last) return;
    last = location.href;
    onNav();
  }, intervalMs);
}

/**
 * @param {() => void} fn
 * @param {number} delayMs
 */
export function createDebounced(fn, delayMs) {
  let timer = null;
  return () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn();
    }, delayMs);
  };
}
