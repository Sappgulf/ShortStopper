import { getLocal, getSync, setLocal, setSync } from "../../platform/chrome.js";
import {
  DEFAULT_LOCAL_STATE,
  DEFAULT_SETTINGS,
  MAX_DAYS,
  mergeDefaults,
  sanitizeSettings
} from "../../storage/settings.js";
import { bumpBlocked, ensureTodayState, resetToday } from "../../storage/stats.js";

export async function getSettings() {
  const s = await getSync(DEFAULT_SETTINGS);
  return sanitizeSettings(s);
}

export async function ensureSettingsDefaults() {
  const current = await getSync(null);
  const patch = {};
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
    if (!(k in (current || {}))) patch[k] = v;
  }
  if (Object.keys(patch).length) await setSync(patch);
}

export async function getLocalState() {
  const s = await getLocal(DEFAULT_LOCAL_STATE);
  return mergeDefaults(DEFAULT_LOCAL_STATE, s);
}

export async function setLocalState(nextState) {
  await setLocal({
    blockedDate: nextState.blockedDate,
    blockedTotal: nextState.blockedTotal,
    stats: nextState.stats
  });
}

export async function ensureTodayLocal(date = new Date()) {
  const local = await getLocalState();
  const ensured = ensureTodayState(local, date, MAX_DAYS);
  if (ensured.didReset) await setLocalState(ensured.state);
  return ensured;
}

export async function bumpBlockedLocal(amount = 1, channelKey = null, date = new Date()) {
  const local = await getLocalState();
  const res = bumpBlocked(local, { amount, channelKey, date, maxDays: MAX_DAYS });
  await setLocalState(res.state);
  return res;
}

export async function resetTodayLocal(date = new Date()) {
  const local = await getLocalState();
  const res = resetToday(local, date, MAX_DAYS);
  await setLocalState(res.state);
  return res;
}
