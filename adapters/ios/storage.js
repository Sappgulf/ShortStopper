import {
  DEFAULT_LOCAL_STATE,
  DEFAULT_SETTINGS,
  MAX_DAYS,
  mergeDefaults,
  sanitizeSettings
} from "../../storage/settings.js";
import { bumpBlocked, ensureTodayState, resetToday } from "../../storage/stats.js";

const SETTINGS_KEY = "ns_settings";
const STATE_KEY = "ns_state";

function readJson(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function getSettings() {
  return sanitizeSettings(readJson(SETTINGS_KEY));
}

export function setSettings(partial) {
  const next = sanitizeSettings({ ...getSettings(), ...(partial || {}) });
  writeJson(SETTINGS_KEY, next);
  return next;
}

export function setSetting(key, value) {
  return setSettings({ [key]: value });
}

export function getLocalState(date = new Date()) {
  const state = mergeDefaults(DEFAULT_LOCAL_STATE, readJson(STATE_KEY));
  const ensured = ensureTodayState(state, date, MAX_DAYS);
  if (ensured.didReset) writeJson(STATE_KEY, ensured.state);
  return ensured.state;
}

export function bumpBlockedLocal(amount = 1, channelKey = null, date = new Date()) {
  const state = mergeDefaults(DEFAULT_LOCAL_STATE, readJson(STATE_KEY));
  const res = bumpBlocked(state, { amount, channelKey, date, maxDays: MAX_DAYS });
  writeJson(STATE_KEY, res.state);
  return res;
}

export function resetTodayLocal(date = new Date()) {
  const state = mergeDefaults(DEFAULT_LOCAL_STATE, readJson(STATE_KEY));
  const res = resetToday(state, date, MAX_DAYS);
  writeJson(STATE_KEY, res.state);
  return res;
}
