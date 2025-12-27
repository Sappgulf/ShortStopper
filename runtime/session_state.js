/**
 * @param {number} repeatMs
 */
export function createBlockGate(repeatMs) {
  let lastUrl = "";
  let lastAt = 0;
  return {
    /**
     * @param {string} url
     */
    shouldCount(url) {
      const now = Date.now();
      if (url === lastUrl && now - lastAt < repeatMs) return false;
      lastUrl = url;
      lastAt = now;
      return true;
    }
  };
}
