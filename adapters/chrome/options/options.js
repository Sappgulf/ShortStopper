import { DEFAULT_SETTINGS } from "../../../core/config.js";

const TOGGLE_IDS = [
  "enabled",
  "adBlockEnabled",
  "whitelistMode",
  "strictRedirect",
  "redirectShorts",
  "hideShelves",
  "hideLinks",
  "hideSidebarEntry",
  "hideChannelShortsTab"
];

function $(id) { return document.getElementById(id); }
function flash(id, msg) { $(id).textContent = msg; setTimeout(() => ($(id).textContent = ""), 1400); }

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c])
  );
}

function renderWhitelist(list) {
  const ul = $("whitelistList");
  ul.innerHTML = "";
  if (!list.length) {
    ul.innerHTML = `<li><span class="muted">Empty</span></li>`;
    return;
  }
  for (const key of list) {
    const li = document.createElement("li");
    li.innerHTML = `<span>${escapeHtml(key)}</span><button class="btn" data-remove="${escapeHtml(key)}">Remove</button>`;
    ul.appendChild(li);
  }
}

function renderOverrides(map) {
  const tbody = $("overrideTable");
  tbody.innerHTML = "";
  const entries = Object.entries(map || {}).sort((a, b) => a[0].localeCompare(b[0]));
  if (!entries.length) {
    tbody.innerHTML = `<tr><td class="muted" colspan="3">No overrides yet.</td></tr>`;
    return;
  }
  for (const [key, mode] of entries) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(key)}</td>
      <td>
        <select data-mode-key="${escapeHtml(key)}">
          <option value="both">both</option>
          <option value="hide">hide</option>
          <option value="redirect">redirect</option>
          <option value="off">off</option>
        </select>
      </td>
      <td><button class="btn" data-del-ov="${escapeHtml(key)}">Delete</button></td>
    `;
    tbody.appendChild(tr);
    tr.querySelector("select").value = mode || "both";
  }
}

function setBackupText(settings) {
  $("backup").value = JSON.stringify(settings, null, 2);
}

async function openStats() {
  await chrome.tabs.create({ url: chrome.runtime.getURL("adapters/chrome/stats/stats.html") });
}

async function ensureAllHostsPermission() {
  const origins = ["<all_urls>"];
  const has = await chrome.permissions.contains({ origins });
  if (has) return true;
  try {
    return await chrome.permissions.request({ origins });
  } catch {
    return false;
  }
}

(async function init() {
  const s = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  const settings = { ...DEFAULT_SETTINGS, ...s };

  for (const id of TOGGLE_IDS) $(id).checked = !!settings[id];
  renderWhitelist(settings.channelWhitelist || []);
  renderOverrides(settings.channelOverrides || {});
  setBackupText(settings);

  for (const id of TOGGLE_IDS) {
    $(id).addEventListener("change", async () => {
      if (id === "adBlockEnabled" && $(id).checked) {
        const ok = await ensureAllHostsPermission();
        if (!ok) {
          $(id).checked = false;
          await chrome.storage.sync.set({ [id]: false });
          flash("status", "Permission denied");
          return;
        }
      }

      await chrome.storage.sync.set({ [id]: $(id).checked });
      flash("status", "Saved");
    });
  }

  $("whitelistList").addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-remove]");
    if (!btn) return;
    const key = btn.getAttribute("data-remove");

    const s2 = await chrome.storage.sync.get(DEFAULT_SETTINGS);
    const list = Array.isArray(s2.channelWhitelist) ? s2.channelWhitelist.slice() : [];
    const next = list.filter((x) => x !== key);
    await chrome.storage.sync.set({ channelWhitelist: next });

    renderWhitelist(next);
    const s3 = await chrome.storage.sync.get(DEFAULT_SETTINGS);
    setBackupText({ ...DEFAULT_SETTINGS, ...s3 });
    flash("status", "Removed");
  });

  $("overrideTable").addEventListener("change", async (e) => {
    const sel = e.target.closest("select[data-mode-key]");
    if (!sel) return;
    const key = sel.getAttribute("data-mode-key");
    const mode = sel.value;

    const s2 = await chrome.storage.sync.get(DEFAULT_SETTINGS);
    const ov = { ...(s2.channelOverrides || {}) };
    ov[key] = mode;
    await chrome.storage.sync.set({ channelOverrides: ov });

    const s3 = await chrome.storage.sync.get(DEFAULT_SETTINGS);
    setBackupText({ ...DEFAULT_SETTINGS, ...s3 });
    flash("status", "Saved");
  });

  $("overrideTable").addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-del-ov]");
    if (!btn) return;
    const key = btn.getAttribute("data-del-ov");

    const s2 = await chrome.storage.sync.get(DEFAULT_SETTINGS);
    const ov = { ...(s2.channelOverrides || {}) };
    delete ov[key];
    await chrome.storage.sync.set({ channelOverrides: ov });

    renderOverrides(ov);
    const s3 = await chrome.storage.sync.get(DEFAULT_SETTINGS);
    setBackupText({ ...DEFAULT_SETTINGS, ...s3 });
    flash("status", "Deleted");
  });

  $("clearWhitelist").addEventListener("click", async () => {
    await chrome.storage.sync.set({ channelWhitelist: [] });
    renderWhitelist([]);
    const s3 = await chrome.storage.sync.get(DEFAULT_SETTINGS);
    setBackupText({ ...DEFAULT_SETTINGS, ...s3 });
    flash("status", "Cleared");
  });

  $("clearOverrides").addEventListener("click", async () => {
    await chrome.storage.sync.set({ channelOverrides: {} });
    renderOverrides({});
    const s3 = await chrome.storage.sync.get(DEFAULT_SETTINGS);
    setBackupText({ ...DEFAULT_SETTINGS, ...s3 });
    flash("status", "Cleared");
  });

  $("copy").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText($("backup").value);
      flash("backupStatus", "Copied");
    } catch {
      flash("backupStatus", "Copy failed (browser blocked clipboard).");
    }
  });

  $("restore").addEventListener("click", async () => {
    let obj = null;
    try { obj = JSON.parse($("backup").value); }
    catch { flash("backupStatus", "Invalid JSON"); return; }

    const next = {};
    for (const k of Object.keys(DEFAULT_SETTINGS)) {
      if (k in obj) next[k] = obj[k];
    }

    await chrome.storage.sync.set(next);

    const s4 = await chrome.storage.sync.get(DEFAULT_SETTINGS);
    const merged = { ...DEFAULT_SETTINGS, ...s4 };
    for (const id of TOGGLE_IDS) $(id).checked = !!merged[id];
    renderWhitelist(merged.channelWhitelist || []);
    renderOverrides(merged.channelOverrides || {});
    setBackupText(merged);
    flash("backupStatus", "Restored");
  });

  $("openStats").addEventListener("click", (e) => {
    e.preventDefault();
    openStats();
  });
})();
