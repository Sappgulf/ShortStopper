/**
 * @typedef {"ns.bumpBlocked" | "ns.getTotals" | "ns.resetToday" | "ns.openOptions" | "ns.getStats" | "ns.getAdblockStats" | "ns.getAdblockHistory" | "ns.clearAdblockHistory" | "ns.updateVideoContext"} ServiceWorkerMessageType
 * @typedef {"ns.getChannelKey" | "ns.getEffective" | "ns.reapply" | "ns.enableBypass" | "ns.disableBypass" | "ns.getBypassStatus"} ContentMessageType
 */

export const SERVICE_WORKER_MESSAGE_TYPES = new Set([
  "ns.bumpBlocked",
  "ns.getTotals",
  "ns.resetToday",
  "ns.openOptions",
  "ns.getStats",
  "ns.getAdblockStats",
  "ns.getAdblockHistory",
  "ns.clearAdblockHistory",
  "ns.updateVideoContext"
]);

export const CONTENT_MESSAGE_TYPES = new Set([
  "ns.getChannelKey",
  "ns.getEffective",
  "ns.reapply",
  "ns.enableBypass",
  "ns.disableBypass",
  "ns.getBypassStatus"
]);

/**
 * Validate message structure - security check
 * @param {unknown} msg
 * @param {Set<string>} allowed
 * @returns {string | null}
 */
export function getMessageType(msg, allowed) {
  // Must be a plain object
  if (!msg || typeof msg !== "object") return null;
  if (Array.isArray(msg)) return null;
  
  const type = msg.type;
  if (typeof type !== "string") return null;
  if (!allowed.has(type)) return null;
  
  // Validate type doesn't contain dangerous characters
  if (!/^[a-zA-Z0-9._-]+$/.test(type)) return null;
  
  return type;
}

/**
 * @param {unknown} msg
 */
export function parseBumpBlockedPayload(msg) {
  if (!msg || typeof msg !== "object") {
    return { amount: 1, channelKey: null };
  }
  const amountRaw = msg.amount;
  // Clamp amount to reasonable range
  let amount = Number.isFinite(amountRaw) ? Math.floor(amountRaw) : 1;
  amount = Math.max(0, Math.min(1000, amount));
  
  const channelKey = typeof msg.channelKey === "string" 
    ? msg.channelKey.slice(0, 200) // Limit length
    : null;
  return { amount, channelKey };
}

/**
 * @param {unknown} msg
 */
export function parseAdblockStatsRequest(msg) {
  if (!msg || typeof msg !== "object") return { tabId: null };
  const tabId = Number.isInteger(msg.tabId) && msg.tabId >= 0 ? msg.tabId : null;
  return { tabId };
}

/**
 * @param {unknown} msg
 */
export function parseVideoContextPayload(msg) {
  if (!msg || typeof msg !== "object") {
    return { siteId: null, videoId: null, title: null };
  }
  
  // Validate and sanitize each field
  const siteId = typeof msg.siteId === "string" && /^[a-z]+$/.test(msg.siteId)
    ? msg.siteId.slice(0, 20)
    : null;
  
  const videoId = typeof msg.videoId === "string" && /^[a-zA-Z0-9_-]+$/.test(msg.videoId)
    ? msg.videoId.slice(0, 20)
    : null;
  
  const title = typeof msg.title === "string"
    ? msg.title.slice(0, 200).replace(/[<>]/g, "") // Basic XSS prevention
    : null;
  
  return { siteId, videoId, title };
}

/**
 * @param {unknown} msg
 */
export function parseBypassPayload(msg) {
  if (!msg || typeof msg !== "object") {
    return { duration: 10 * 60 * 1000 };
  }
  
  let duration = Number.isFinite(msg.duration) ? Math.floor(msg.duration) : 10 * 60 * 1000;
  // Clamp to 1 minute - 1 hour
  duration = Math.max(60_000, Math.min(3_600_000, duration));
  
  return { duration };
}
