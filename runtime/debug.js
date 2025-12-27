const DEBUG_KEY = "ns_debug";

export function isDebugEnabled() {
  try {
    return sessionStorage.getItem(DEBUG_KEY) === "1";
  } catch {
    return false;
  }
}

export function debugLog(...args) {
  if (!isDebugEnabled()) return;
  console.debug("[ShortStopper]", ...args);
}
