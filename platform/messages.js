/**
 * @typedef {"ns.bumpBlocked" | "ns.getTotals" | "ns.resetToday" | "ns.openOptions" | "ns.getStats" | "ns.getAdblockStats" | "ns.getAdblockHistory" | "ns.clearAdblockHistory" | "ns.updateVideoContext"} ServiceWorkerMessageType
 * @typedef {"ns.getChannelKey" | "ns.getEffective" | "ns.reapply"} ContentMessageType
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

export const CONTENT_MESSAGE_TYPES = new Set(["ns.getChannelKey", "ns.getEffective", "ns.reapply"]);

/**
 * @param {unknown} msg
 * @param {Set<string>} allowed
 */
export function getMessageType(msg, allowed) {
  if (!msg || typeof msg !== "object") return null;
  const type = msg.type;
  if (typeof type !== "string") return null;
  if (!allowed.has(type)) return null;
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
  const amount = Number.isFinite(amountRaw) ? amountRaw : 1;
  const channelKey = typeof msg.channelKey === "string" ? msg.channelKey : null;
  return { amount, channelKey };
}

/**
 * @param {unknown} msg
 */
export function parseAdblockStatsRequest(msg) {
  if (!msg || typeof msg !== "object") return { tabId: null };
  const tabId = Number.isInteger(msg.tabId) ? msg.tabId : null;
  return { tabId };
}

/**
 * @param {unknown} msg
 */
export function parseVideoContextPayload(msg) {
  if (!msg || typeof msg !== "object") {
    return { siteId: null, videoId: null, title: null };
  }
  const siteId = typeof msg.siteId === "string" ? msg.siteId : null;
  const videoId = typeof msg.videoId === "string" ? msg.videoId : null;
  const title = typeof msg.title === "string" ? msg.title : null;
  return { siteId, videoId, title };
}
