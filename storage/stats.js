/**
 * @param {Date | string | number} [date]
 * @returns {string}
 */
export function todayKey(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * @param {Record<string, unknown>} daysObj
 * @param {number} maxDays
 */
export function pruneDays(daysObj, maxDays) {
  const keys = Object.keys(daysObj || {}).sort(); // YYYY-MM-DD sorts lexicographically
  const extra = keys.length - maxDays;
  if (extra > 0) {
    for (let i = 0; i < extra; i++) delete daysObj[keys[i]];
  }
}

function clone(obj) {
  return obj ? JSON.parse(JSON.stringify(obj)) : obj;
}

/**
 * @param {import("./settings.js").LocalState} state
 * @param {Date | string | number} date
 * @param {number} maxDays
 */
export function ensureTodayState(state, date, maxDays) {
  const t = todayKey(date);
  const next = clone(state);

  if (next.blockedDate !== t) {
    next.blockedDate = t;
    next.blockedTotal = 0;

    next.stats = next.stats?.days ? next.stats : { days: {} };
    next.stats.days[t] = next.stats.days[t] || { total: 0, channels: {} };
    pruneDays(next.stats.days, maxDays);

    return { state: next, didReset: true };
  }

  next.stats = next.stats?.days ? next.stats : { days: {} };
  next.stats.days[t] = next.stats.days[t] || { total: 0, channels: {} };
  pruneDays(next.stats.days, maxDays);
  return { state: next, didReset: false };
}

/**
 * @param {import("./settings.js").LocalState} state
 * @param {{ amount?: number, channelKey?: string | null, date?: Date, maxDays: number }} opts
 */
export function bumpBlocked(state, { amount = 1, channelKey = null, date = new Date(), maxDays }) {
  const ensured = ensureTodayState(state, date, maxDays);
  const t = todayKey(date);

  const add = Math.max(0, amount | 0);
  const next = clone(ensured.state);
  next.blockedTotal = (next.blockedTotal || 0) + add;

  next.stats = next.stats?.days ? next.stats : { days: {} };
  next.stats.days[t] = next.stats.days[t] || { total: 0, channels: {} };
  next.stats.days[t].total = (next.stats.days[t].total || 0) + add;

  if (channelKey) {
    const key = String(channelKey);
    next.stats.days[t].channels[key] = (next.stats.days[t].channels[key] || 0) + add;
  }

  pruneDays(next.stats.days, maxDays);
  return { state: next, total: next.blockedTotal, didReset: ensured.didReset };
}

/**
 * @param {import("./settings.js").LocalState} state
 * @param {Date | string | number} [date]
 * @param {number} maxDays
 */
export function resetToday(state, date = new Date(), maxDays) {
  const ensured = ensureTodayState(state, date, maxDays);
  const t = todayKey(date);

  const next = clone(ensured.state);
  next.blockedDate = t;
  next.blockedTotal = 0;
  next.stats = next.stats?.days ? next.stats : { days: {} };
  next.stats.days[t] = next.stats.days[t] || { total: 0, channels: {} };
  next.stats.days[t].total = 0;
  next.stats.days[t].channels = {};
  pruneDays(next.stats.days, maxDays);
  return { state: next };
}
