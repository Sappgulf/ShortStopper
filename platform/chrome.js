export function getRuntimeId() {
  return chrome?.runtime?.id || "";
}

export function getRuntimeUrl(path) {
  return chrome.runtime.getURL(path);
}

export function sendRuntimeMessage(msg) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    const timer = setTimeout(() => done(null), 2000);
    try {
      chrome.runtime.sendMessage(msg, (response) => {
        clearTimeout(timer);
        if (chrome.runtime.lastError) {
          done(null);
          return;
        }
        done(response);
      });
    } catch {
      clearTimeout(timer);
      done(null);
    }
  });
}

export function addRuntimeMessageListener(handler) {
  return chrome.runtime.onMessage.addListener(handler);
}

export function openOptionsPage() {
  return chrome.runtime.openOptionsPage();
}

export function getSync(keys) {
  return chrome.storage.sync.get(keys);
}

export function setSync(values) {
  return chrome.storage.sync.set(values);
}

export function getLocal(keys) {
  return chrome.storage.local.get(keys);
}

export function setLocal(values) {
  return chrome.storage.local.set(values);
}

export function addStorageChangeListener(handler) {
  return chrome.storage.onChanged.addListener(handler);
}

export function queryTabs(queryInfo) {
  return chrome.tabs.query(queryInfo);
}

export function sendTabMessage(tabId, msg) {
  return chrome.tabs.sendMessage(tabId, msg);
}

export function createTab(createProperties) {
  return chrome.tabs.create(createProperties);
}

export function setBadgeText(text) {
  return chrome.action.setBadgeText({ text });
}

export function setBadgeBackgroundColor(color) {
  return chrome.action.setBadgeBackgroundColor({ color });
}

export function updateRulesets(enableRulesetIds, disableRulesetIds) {
  return chrome.declarativeNetRequest.updateEnabledRulesets({
    enableRulesetIds,
    disableRulesetIds
  });
}

export function getEnabledRulesets() {
  return chrome.declarativeNetRequest.getEnabledRulesets();
}

export function permissionsContains(origins = [], permissions = []) {
  const payload = {};
  if (origins && origins.length) payload.origins = origins;
  if (permissions && permissions.length) payload.permissions = permissions;
  return chrome.permissions.contains(payload);
}

export function permissionsRequest(origins = [], permissions = []) {
  const payload = {};
  if (origins && origins.length) payload.origins = origins;
  if (permissions && permissions.length) payload.permissions = permissions;
  return chrome.permissions.request(payload);
}

export function permissionsGetAll() {
  return chrome.permissions.getAll();
}
