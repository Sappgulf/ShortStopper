/**
 * Debug logging utilities for ShortStopper.
 * 
 * To enable debug logging:
 * 1. Open browser console on any supported site
 * 2. Run: sessionStorage.setItem('ns_debug', '1')
 * 3. Refresh the page
 * 
 * To disable: sessionStorage.removeItem('ns_debug')
 */

const DEBUG_KEY = "ns_debug";
const LOG_PREFIX = "[ShortStopper]";

// Cache the debug state to avoid repeated storage reads
let debugEnabled = null;

/**
 * Check if debug mode is enabled
 * @returns {boolean}
 */
export function isDebugEnabled() {
  if (debugEnabled !== null) return debugEnabled;
  try {
    debugEnabled = sessionStorage.getItem(DEBUG_KEY) === "1";
  } catch {
    debugEnabled = false;
  }
  return debugEnabled;
}

/**
 * Enable debug mode
 */
export function enableDebug() {
  try {
    sessionStorage.setItem(DEBUG_KEY, "1");
    debugEnabled = true;
    console.info(LOG_PREFIX, "Debug mode enabled. Refresh to see full logs.");
  } catch {}
}

/**
 * Disable debug mode
 */
export function disableDebug() {
  try {
    sessionStorage.removeItem(DEBUG_KEY);
    debugEnabled = false;
    console.info(LOG_PREFIX, "Debug mode disabled.");
  } catch {}
}

/**
 * Log a debug message (only when debug is enabled)
 * @param {string} category - Log category (e.g., "blocked", "allowed", "error")
 * @param {object} [data] - Additional data to log
 */
export function debugLog(category, data = {}) {
  if (!isDebugEnabled()) return;
  
  const timestamp = new Date().toISOString().slice(11, 23);
  console.debug(LOG_PREFIX, `[${timestamp}]`, category, data);
}

/**
 * Log an error (always logged, not just in debug mode)
 * @param {string} message
 * @param {Error} [error]
 */
export function errorLog(message, error = null) {
  console.error(LOG_PREFIX, message, error || "");
}

/**
 * Get a diagnostic dump for troubleshooting
 * @returns {object}
 */
export function getDiagnostics() {
  return {
    debugEnabled: isDebugEnabled(),
    url: location.href,
    hostname: location.hostname,
    pathname: location.pathname,
    timestamp: new Date().toISOString(),
    userAgent: navigator.userAgent,
    extensionId: typeof chrome !== "undefined" ? chrome.runtime?.id : "unknown"
  };
}

// Expose to window for console access (only in debug mode)
if (typeof window !== "undefined") {
  try {
    Object.defineProperty(window, "nsDebug", {
      get() {
        return {
          enable: enableDebug,
          disable: disableDebug,
          diagnostics: getDiagnostics,
          isEnabled: isDebugEnabled
        };
      },
      configurable: true
    });
  } catch {}
}
