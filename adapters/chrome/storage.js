import { DEFAULT_LOCAL_STATE, DEFAULT_SETTINGS, MAX_DAYS, mergeDefaults } from "../../core/config.js";
import { bumpBlocked, ensureTodayState, resetToday } from "../../core/stats.js";

export async function getSettings() {
  const s = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  return mergeDefaults(DEFAULT_SETTINGS, s);
}

export async function ensureSettingsDefaults() {
  const current = await chrome.storage.sync.get(null);
  const patch = {};
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
    if (!(k in (current || {}))) patch[k] = v;
  }
  if (Object.keys(patch).length) await chrome.storage.sync.set(patch);
}

export async function getLocalState() {
  const s = await chrome.storage.local.get(DEFAULT_LOCAL_STATE);
  return mergeDefaults(DEFAULT_LOCAL_STATE, s);
}

export async function setLocalState(nextState) {
  await chrome.storage.local.set({
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

