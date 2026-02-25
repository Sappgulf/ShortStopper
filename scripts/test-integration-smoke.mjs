import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ADBLOCK_HOSTS } from "../policy/adblock_hosts.js";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function createEvent() {
  const listeners = [];
  return {
    addListener(fn) {
      listeners.push(fn);
    },
    async emit(...args) {
      for (const fn of listeners) {
        await fn(...args);
      }
    },
    get listeners() {
      return listeners;
    }
  };
}

function makeStorageArea(areaName, store, onChangedEvent) {
  return {
    async get(keys) {
      if (keys == null) return clone(store);
      if (typeof keys === "string") return { [keys]: clone(store[keys]) };
      if (Array.isArray(keys)) {
        const out = {};
        for (const key of keys) out[key] = clone(store[key]);
        return out;
      }
      if (typeof keys === "object") {
        const out = clone(keys) || {};
        for (const key of Object.keys(keys)) {
          if (key in store) out[key] = clone(store[key]);
        }
        return out;
      }
      return {};
    },
    async set(values) {
      const changes = {};
      for (const [key, newValue] of Object.entries(values || {})) {
        const oldValue = clone(store[key]);
        store[key] = clone(newValue);
        changes[key] = { oldValue, newValue: clone(newValue) };
      }
      if (Object.keys(changes).length) {
        await onChangedEvent.emit(changes, areaName);
      }
    }
  };
}

function createChromeMock() {
  const runtimeOnMessage = createEvent();
  const runtimeOnInstalled = createEvent();
  const runtimeOnSuspend = createEvent();
  const tabsOnRemoved = createEvent();
  const storageOnChanged = createEvent();
  const onRuleMatchedDebug = createEvent();

  const syncStore = {};
  const localStore = {};
  const grantedOrigins = new Set();
  const grantedPermissions = new Set();
  const enabledRulesets = new Set();
  const openedTabs = [];
  let optionsOpened = 0;
  let badgeText = "";
  let badgeColor = "";

  const storage = {
    onChanged: storageOnChanged,
    sync: makeStorageArea("sync", syncStore, storageOnChanged),
    local: makeStorageArea("local", localStore, storageOnChanged)
  };

  const chrome = {
    runtime: {
      id: "ext-test",
      onMessage: runtimeOnMessage,
      onInstalled: runtimeOnInstalled,
      onSuspend: runtimeOnSuspend,
      openOptionsPage: async () => {
        optionsOpened += 1;
      }
    },
    storage,
    tabs: {
      onRemoved: tabsOnRemoved,
      async query() {
        return [];
      },
      async sendMessage() {
        return null;
      },
      async create(props) {
        openedTabs.push(clone(props));
        return { id: openedTabs.length, ...props };
      }
    },
    action: {
      async setBadgeText({ text }) {
        badgeText = text;
      },
      async setBadgeBackgroundColor({ color }) {
        badgeColor = color;
      }
    },
    declarativeNetRequest: {
      onRuleMatchedDebug,
      async updateEnabledRulesets({ enableRulesetIds = [], disableRulesetIds = [] }) {
        for (const id of disableRulesetIds) enabledRulesets.delete(id);
        for (const id of enableRulesetIds) enabledRulesets.add(id);
      },
      async getEnabledRulesets() {
        return [...enabledRulesets];
      }
    },
    permissions: {
      async contains(payload = {}) {
        const origins = payload.origins || [];
        const permissions = payload.permissions || [];
        return (
          origins.every((x) => grantedOrigins.has(x)) &&
          permissions.every((x) => grantedPermissions.has(x))
        );
      },
      async request(payload = {}) {
        for (const x of payload.origins || []) grantedOrigins.add(x);
        for (const x of payload.permissions || []) grantedPermissions.add(x);
        return true;
      },
      async getAll() {
        return {
          origins: [...grantedOrigins],
          permissions: [...grantedPermissions]
        };
      }
    }
  };

  async function invokeRuntimeMessage(msg, sender = {}) {
    assert.equal(runtimeOnMessage.listeners.length > 0, true, "runtime.onMessage listener should be registered");
    const listener = runtimeOnMessage.listeners[0];
    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) reject(new Error(`Timed out waiting for response to ${msg?.type || "(unknown)"}`));
      }, 500);

      const sendResponse = (response) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(response);
      };

      try {
        const ret = listener(msg, sender, sendResponse);
        if (ret !== true && !settled) {
          settled = true;
          clearTimeout(timer);
          resolve(undefined);
        }
      } catch (err) {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(err);
        }
      }
    });
  }

  return {
    chrome,
    state: {
      syncStore,
      localStore,
      grantedOrigins,
      grantedPermissions,
      enabledRulesets,
      openedTabs,
      get badgeText() {
        return badgeText;
      },
      get badgeColor() {
        return badgeColor;
      },
      get optionsOpened() {
        return optionsOpened;
      }
    },
    events: {
      runtimeOnInstalled,
      runtimeOnSuspend,
      tabsOnRemoved,
      storageOnChanged,
      onRuleMatchedDebug
    },
    invokeRuntimeMessage
  };
}

async function importServiceWorkerWithMock(chromeMock) {
  globalThis.chrome = chromeMock.chrome;
  const swUrl = pathToFileURL(path.join(ROOT, "adapters/chrome/service_worker.js")).href + `?t=${Date.now()}`;
  await import(swUrl);
}

function extractIdsFromHtml(html) {
  const ids = new Set();
  const re = /\bid="([^"]+)"/g;
  let match;
  while ((match = re.exec(html))) ids.add(match[1]);
  return ids;
}

function extractJsIdRefs(js) {
  const ids = new Set();
  const patterns = [
    /\$\("([^"]+)"\)/g,
    /getElementById\("([^"]+)"\)/g
  ];
  for (const re of patterns) {
    let match;
    while ((match = re.exec(js))) ids.add(match[1]);
  }
  return ids;
}

function extractArrayLiterals(js, varName) {
  const match = js.match(new RegExp(`const\\s+${varName}\\s*=\\s*\\[(.*?)\\];`, "s"));
  if (!match) return [];
  return [...match[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

async function testUiDomContracts() {
  const checks = [
    {
      name: "popup",
      htmlPath: path.join(ROOT, "adapters/chrome/popup/popup.html"),
      jsPath: path.join(ROOT, "adapters/chrome/popup/popup.js"),
      extraArrayVars: ["TOGGLE_IDS"]
    },
    {
      name: "options",
      htmlPath: path.join(ROOT, "adapters/chrome/options/options.html"),
      jsPath: path.join(ROOT, "adapters/chrome/options/options.js"),
      extraArrayVars: ["TOGGLE_IDS"]
    },
    {
      name: "stats",
      htmlPath: path.join(ROOT, "adapters/chrome/stats/stats.html"),
      jsPath: path.join(ROOT, "adapters/chrome/stats/stats.js"),
      extraArrayVars: []
    }
  ];

  for (const check of checks) {
    const [html, js] = await Promise.all([
      readFile(check.htmlPath, "utf8"),
      readFile(check.jsPath, "utf8")
    ]);
    const htmlIds = extractIdsFromHtml(html);
    const refs = extractJsIdRefs(js);
    for (const varName of check.extraArrayVars) {
      for (const id of extractArrayLiterals(js, varName)) refs.add(id);
    }
    const missing = [...refs].filter((id) => !htmlIds.has(id));
    assert.deepEqual(missing, [], `${check.name} UI is missing IDs referenced by JS: ${missing.join(", ")}`);
  }
}

async function testServiceWorkerIntegration() {
  const mock = createChromeMock();
  await importServiceWorkerWithMock(mock);

  assert.equal(mock.events.runtimeOnInstalled.listeners.length > 0, true, "onInstalled listener should be registered");
  await mock.events.runtimeOnInstalled.emit();

  assert.equal(mock.state.syncStore.enabled, true, "defaults should be initialized in sync storage");
  assert.equal(mock.state.localStore.blockedTotal, 0, "defaults should be initialized in local storage");
  assert.equal(mock.state.enabledRulesets.has("shorts_redirect"), true, "strict redirect ruleset should be enabled by default");
  assert.equal(mock.state.badgeColor, "#4a7dff", "badge color should be set");

  await mock.chrome.storage.sync.set({ whitelistMode: true });
  assert.equal(
    mock.state.enabledRulesets.has("shorts_redirect"),
    false,
    "whitelist mode should disable strict DNR redirect ruleset"
  );

  await mock.chrome.storage.sync.set({ whitelistMode: false, strictRedirect: false });
  assert.equal(
    mock.state.enabledRulesets.has("shorts_redirect"),
    false,
    "strictRedirect=false should disable strict DNR redirect ruleset"
  );

  await mock.chrome.storage.sync.set({ strictRedirect: true });
  assert.equal(
    mock.state.enabledRulesets.has("shorts_redirect"),
    true,
    "strictRedirect=true should re-enable DNR redirect ruleset when safe"
  );

  await mock.chrome.storage.sync.set({ channelOverrides: { "@test": "off" } });
  assert.equal(
    mock.state.enabledRulesets.has("shorts_redirect"),
    false,
    "channel overrides should disable strict DNR redirect ruleset"
  );

  await mock.chrome.storage.sync.set({ channelOverrides: {} });
  assert.equal(
    mock.state.enabledRulesets.has("shorts_redirect"),
    true,
    "removing channel overrides should allow strict DNR redirect ruleset"
  );

  const sender = { id: mock.chrome.runtime.id };
  const bumpRes = await mock.invokeRuntimeMessage({ type: "ns.bumpBlocked", amount: 2, channelKey: "site:youtube" }, sender);
  assert.equal(bumpRes?.ok, true, "ns.bumpBlocked should succeed");
  assert.equal(bumpRes?.total, 2, "ns.bumpBlocked should return updated total");

  const totalsRes = await mock.invokeRuntimeMessage({ type: "ns.getTotals" }, sender);
  assert.equal(totalsRes?.blockedTotal, 2, "ns.getTotals should reflect bumped total");
  assert.ok(typeof totalsRes?.blockedDate === "string" && totalsRes.blockedDate.length === 10, "ns.getTotals should return date key");

  const statsRes = await mock.invokeRuntimeMessage({ type: "ns.getStats" }, sender);
  const dayStats = statsRes?.stats?.days?.[totalsRes.blockedDate];
  assert.equal(dayStats?.total, 2, "ns.getStats should include daily total");
  assert.equal(dayStats?.channels?.["site:youtube"], 2, "ns.getStats should include channel/source totals");

  await mock.chrome.permissions.request({
    origins: ADBLOCK_HOSTS,
    permissions: ["declarativeNetRequestFeedback"]
  });
  await mock.chrome.storage.sync.set({ adblockInsights: true, adBlockEnabled: true });

  const updateCtxRes = await mock.invokeRuntimeMessage(
    { type: "ns.updateVideoContext", siteId: "youtube", videoId: "abc123", title: "Test Video" },
    { id: mock.chrome.runtime.id, tab: { id: 99 } }
  );
  assert.equal(updateCtxRes?.ok, true, "ns.updateVideoContext should succeed with a tab sender");

  await mock.events.onRuleMatchedDebug.emit({
    rule: { rulesetId: "basic_block", ruleId: 1001 },
    request: { tabId: 99, url: "https://doubleclick.net/pagead/id" }
  });

  const adStatsRes = await mock.invokeRuntimeMessage({ type: "ns.getAdblockStats", tabId: 99 }, sender);
  assert.equal(adStatsRes?.stats?.enabled, true, "ns.getAdblockStats should report enabled when insights are on");
  assert.equal(adStatsRes?.stats?.total, 1, "adblock stats should count blocked requests");
  assert.equal(adStatsRes?.stats?.videoTotal, 1, "adblock stats should associate hits with current video");
  assert.equal(adStatsRes?.stats?.videoId, "abc123", "adblock stats should return current video id");

  const historyRes = await mock.invokeRuntimeMessage({ type: "ns.getAdblockHistory" }, sender);
  assert.equal(Array.isArray(historyRes?.history?.entries), true, "history response should include entries");
  assert.equal(historyRes.history.entries.some((x) => x.host === "doubleclick.net"), true, "history should include blocked host");

  const clearHistoryRes = await mock.invokeRuntimeMessage({ type: "ns.clearAdblockHistory" }, sender);
  assert.equal(clearHistoryRes?.ok, true, "ns.clearAdblockHistory should succeed");
  const historyAfterClear = await mock.invokeRuntimeMessage({ type: "ns.getAdblockHistory" }, sender);
  assert.equal(historyAfterClear.history.entries.length, 0, "cleared history should be empty");
}

async function main() {
  await testUiDomContracts();
  await testServiceWorkerIntegration();
  console.log("integration smoke: ok");
}

main().catch((err) => {
  console.error("integration smoke: failed", err);
  process.exitCode = 1;
});
