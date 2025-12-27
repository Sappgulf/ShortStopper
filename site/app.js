const CONFIG = {
  WEBSTORE_URL: "",
  DOWNLOAD_ZIP_URL: "https://github.com/Sappgulf/ShortStopper/archive/refs/heads/main.zip",
  SOURCE_URL: "https://github.com/Sappgulf/ShortStopper"
};

const MANIFEST_URLS = ["../manifest.json", "manifest.json"];

function setLinkState(el, url, enabledLabel, disabledLabel) {
  if (!el) return;
  if (!url) {
    el.classList.add("is-disabled");
    el.setAttribute("aria-disabled", "true");
    el.setAttribute("tabindex", "-1");
    if (disabledLabel) el.textContent = disabledLabel;
    el.href = "#";
    return;
  }
  el.classList.remove("is-disabled");
  el.removeAttribute("aria-disabled");
  el.removeAttribute("tabindex");
  if (enabledLabel) el.textContent = enabledLabel;
  el.href = url;
  if (el.dataset.link === "source") el.target = "_blank";
}

async function fetchManifest() {
  for (const url of MANIFEST_URLS) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) continue;
      return await res.json();
    } catch {
      continue;
    }
  }
  return null;
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" });
}

function setVersionInfo(manifest) {
  const versionEl = document.getElementById("versionValue");
  const updatedEl = document.getElementById("updatedValue");
  if (!versionEl || !updatedEl) return;

  if (manifest?.version) {
    versionEl.textContent = manifest.version;
  }

  const manifestDate = manifest?.version_name && /\d{4}/.test(manifest.version_name)
    ? manifest.version_name
    : null;
  const fallbackDate = formatDate(document.lastModified);
  updatedEl.textContent = manifestDate ? formatDate(manifestDate) : fallbackDate;
}

function setYear() {
  const yearEl = document.getElementById("yearValue");
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());
}

function setupCopyButtons() {
  const buttons = document.querySelectorAll("[data-copy]");
  buttons.forEach((btn) => {
    btn.addEventListener("click", async () => {
      const text = btn.getAttribute("data-copy") || "";
      if (!text) return;

      let ok = false;
      try {
        await navigator.clipboard.writeText(text);
        ok = true;
      } catch {
        try {
          const ta = document.createElement("textarea");
          ta.value = text;
          ta.style.position = "fixed";
          ta.style.opacity = "0";
          document.body.appendChild(ta);
          ta.select();
          ok = document.execCommand("copy");
          document.body.removeChild(ta);
        } catch {
          ok = false;
        }
      }

      const label = btn.getAttribute("data-copy-label") || "Copy";
      btn.textContent = ok ? "Copied" : "Copy failed";
      setTimeout(() => {
        btn.textContent = label;
      }, 1200);
    });
  });
}

function initLinks() {
  const linkEls = document.querySelectorAll("[data-link]");
  linkEls.forEach((el) => {
    const type = el.getAttribute("data-link");
    if (!type) return;
    const url =
      type === "webstore" ? CONFIG.WEBSTORE_URL :
      type === "zip" ? CONFIG.DOWNLOAD_ZIP_URL :
      type === "source" ? CONFIG.SOURCE_URL : "";
    setLinkState(el, url, el.getAttribute("data-label"), el.getAttribute("data-disabled-label"));
  });
}

async function init() {
  initLinks();
  setupCopyButtons();
  setYear();
  const manifest = await fetchManifest();
  setVersionInfo(manifest);
}

document.addEventListener("DOMContentLoaded", init);
