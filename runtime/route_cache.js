/**
 * @param {{ ttlMs?: number, maxEntries?: number }} opts
 */
export function createRouteCache({ ttlMs = 1500, maxEntries = 32 } = {}) {
  const cache = new Map();

  function prune() {
    if (cache.size <= maxEntries) return;
    const keys = cache.keys();
    while (cache.size > maxEntries) {
      const next = keys.next();
      if (next.done) break;
      cache.delete(next.value);
    }
  }

  return {
    /**
     * @param {string} url
     */
    get(url) {
      const entry = cache.get(url);
      if (!entry) return null;
      if (Date.now() - entry.at > ttlMs) {
        cache.delete(url);
        return null;
      }
      return entry.value;
    },
    /**
     * @param {string} url
     * @param {unknown} value
     */
    set(url, value) {
      cache.set(url, { value, at: Date.now() });
      prune();
    },
    clear() {
      cache.clear();
    }
  };
}
