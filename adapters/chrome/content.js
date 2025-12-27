/**
 * Content script loader - minimal bootstrap that loads the main module.
 * Uses dynamic import to load the content module from the extension.
 * 
 * Security: This is the only entry point from the page context.
 * The content_module.js is loaded via chrome.runtime.getURL which
 * ensures it comes from our extension bundle.
 */
(function bootstrap() {
  // Verify we're in a valid extension context
  if (typeof chrome === "undefined" || !chrome.runtime || !chrome.runtime.getURL) {
    return;
  }

  // Generate the module URL - this uses the extension's internal URL scheme
  const moduleUrl = chrome.runtime.getURL("adapters/chrome/content_module.js");
  
  // Validate the URL starts with our extension's scheme
  if (!moduleUrl.startsWith("chrome-extension://")) {
    return;
  }

  import(moduleUrl)
    .then((m) => {
      if (typeof m.start === "function") {
        m.start();
      }
    })
    .catch((err) => {
      // Only log in development - check for debug flag
      try {
        if (sessionStorage.getItem("ns_debug") === "1") {
          console.warn("ShortStopper: failed to load content module.", err);
        }
      } catch {
        // sessionStorage may not be available
      }
      fallbackBlockShorts();
    });
})();

function fallbackBlockShorts() {
  try {
    const host = String(location.hostname || "");
    if (!host.endsWith("youtube.com")) return;

    const path = location.pathname || "/";
    if (path.startsWith("/shorts") || path.startsWith("/feed/shorts")) {
      location.replace(`${location.origin}/`);
    }

    const replaceLabel = () => {
      const entries = document.querySelectorAll(
        "ytd-guide-entry-renderer,ytd-mini-guide-entry-renderer"
      );
      entries.forEach((entry) => {
        const anchor = entry.querySelector("a[href]");
        const href = anchor?.getAttribute("href") || "";
        if (!href.includes("/shorts") && !href.includes("/feed/shorts")) return;
        const nodes = entry.querySelectorAll("yt-formatted-string, span, div");
        nodes.forEach((node) => {
          const text = node.textContent ? node.textContent.trim() : "";
          if (text === "Shorts") node.textContent = "Slop";
        });
      });
    };

    replaceLabel();
    const obs = new MutationObserver(() => replaceLabel());
    obs.observe(document.documentElement, { childList: true, subtree: true });
  } catch {}
}
