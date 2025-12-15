// Legacy entrypoint (pre-refactor). The extension now runs from `adapters/chrome/*`.
(function bootstrap() {
  try {
    const p = location.pathname || "";
    if (p.startsWith("/shorts") || p.startsWith("/feed/shorts")) {
      document.documentElement.setAttribute("data-ns-preblock", "true");
      document.documentElement.style.setProperty("visibility", "hidden", "important");
    }
  } catch {}

  import(chrome.runtime.getURL("adapters/chrome/content_module.js"))
    .then((m) => m.start())
    .catch(() => {});
})();

