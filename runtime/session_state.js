/**
 * Redirect loop protection and rate limiting
 */

const MAX_REDIRECTS_PER_MINUTE = 3;
const REDIRECT_WINDOW_MS = 60_000;

/**
 * @param {number} repeatMs
 */
export function createBlockGate(repeatMs) {
  let lastUrl = "";
  let lastAt = 0;
  const redirectHistory = [];

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
    },

    /**
     * Check if we should allow a redirect (loop protection)
     * @param {string} fromUrl
     * @param {string} toUrl
     * @returns {boolean}
     */
    canRedirect(fromUrl, toUrl) {
      const now = Date.now();
      
      // Prune old entries
      while (redirectHistory.length > 0 && now - redirectHistory[0].at > REDIRECT_WINDOW_MS) {
        redirectHistory.shift();
      }

      // Check for redirect loop (same destination)
      const recentToSame = redirectHistory.filter(r => r.to === toUrl).length;
      if (recentToSame >= MAX_REDIRECTS_PER_MINUTE) {
        return false;
      }

      // Check for ping-pong loop
      const lastRedirect = redirectHistory[redirectHistory.length - 1];
      if (lastRedirect && lastRedirect.from === toUrl && lastRedirect.to === fromUrl) {
        return false;
      }

      // Record this redirect
      redirectHistory.push({ from: fromUrl, to: toUrl, at: now });
      
      // Keep history bounded
      if (redirectHistory.length > 20) {
        redirectHistory.shift();
      }

      return true;
    },

    /**
     * Clear redirect history (e.g., when user manually navigates)
     */
    clearHistory() {
      redirectHistory.length = 0;
    }
  };
}

/**
 * Temporary bypass/pause state
 */
const BYPASS_KEY = "ns_bypass";
const BYPASS_DURATION_MS = 10 * 60 * 1000; // 10 minutes

export function createBypassManager() {
  return {
    /**
     * Check if bypass is active for a site
     * @param {string} siteId
     * @returns {boolean}
     */
    isActive(siteId) {
      try {
        const raw = sessionStorage.getItem(BYPASS_KEY);
        if (!raw) return false;
        const data = JSON.parse(raw);
        if (!data || typeof data !== "object") return false;
        
        const entry = data[siteId];
        if (!entry || typeof entry.until !== "number") return false;
        
        return Date.now() < entry.until;
      } catch {
        return false;
      }
    },

    /**
     * Enable bypass for a site
     * @param {string} siteId
     * @param {number} [durationMs]
     */
    enable(siteId, durationMs = BYPASS_DURATION_MS) {
      try {
        const raw = sessionStorage.getItem(BYPASS_KEY);
        const data = raw ? JSON.parse(raw) : {};
        data[siteId] = { until: Date.now() + durationMs };
        sessionStorage.setItem(BYPASS_KEY, JSON.stringify(data));
      } catch {}
    },

    /**
     * Disable bypass for a site
     * @param {string} siteId
     */
    disable(siteId) {
      try {
        const raw = sessionStorage.getItem(BYPASS_KEY);
        if (!raw) return;
        const data = JSON.parse(raw);
        delete data[siteId];
        sessionStorage.setItem(BYPASS_KEY, JSON.stringify(data));
      } catch {}
    },

    /**
     * Get remaining bypass time in ms
     * @param {string} siteId
     * @returns {number}
     */
    getRemainingMs(siteId) {
      try {
        const raw = sessionStorage.getItem(BYPASS_KEY);
        if (!raw) return 0;
        const data = JSON.parse(raw);
        const entry = data?.[siteId];
        if (!entry?.until) return 0;
        return Math.max(0, entry.until - Date.now());
      } catch {
        return 0;
      }
    }
  };
}
