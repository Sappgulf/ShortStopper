(function bootstrap() {
  import(chrome.runtime.getURL("adapters/chrome/content_module.js"))
    .then((m) => m.start())
    .catch((err) => {
      try {
        console.warn("ShortStopper failed to load content module.", err);
      } catch {}
    });
})();
