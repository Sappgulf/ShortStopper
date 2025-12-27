// Legacy entrypoint (pre-refactor). The extension now runs from `adapters/chrome/*`.
(function bootstrap() {
  import(chrome.runtime.getURL("adapters/chrome/content_module.js"))
    .then((m) => m.start())
    .catch(() => {});
})();
