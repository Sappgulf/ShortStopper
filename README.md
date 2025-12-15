# ShortStopper (No Shorts Companion)

A lightweight MV3 extension that blocks YouTube Shorts (hide + redirect-to-Home) with per-channel allow/override modes, plus local stats. Includes an optional basic ad/tracker blocker (Chrome-only, permission-gated).

## Install (Chrome)

**Option A (easiest): GitHub Releases**

1. Download `ShortStopper-chrome.zip` from the latest GitHub Release.
2. Unzip it.
3. Open `chrome://extensions` and enable **Developer mode**.
4. Click **Load unpacked** and select the unzipped folder.

**Option B: GitHub “Download ZIP”**

1. Click **Code → Download ZIP** on GitHub and unzip it.
2. Open `chrome://extensions` and enable **Developer mode**.
3. Click **Load unpacked** and select the unzipped folder.

## Download page

If GitHub Pages is enabled for this repo, a simple download/install page is available at:

- `https://sappgulf.github.io/ShortStopper/`

## Use

- **Redirect Shorts → Home**: when enabled, `/shorts/*` and `/feed/shorts` are immediately blocked and you’re sent to Home.
- **Whitelist mode**: blocks Shorts everywhere except channels you add to the whitelist (per-channel overrides still apply).
- **Stats**: counts blocked items and shows a simple trend + top channels.
- **Block ads/trackers (basic)**: enables a small DNR blocklist. When you turn it on, Chrome will prompt for `<all_urls>` host access so it can work across the web.

## For maintainers

- Build the Chrome zip: `bash scripts/package-chrome.sh`
- Creating a tag like `v1.0.0` triggers GitHub Actions to attach `ShortStopper-chrome.zip` to a Release.

## iOS / Safari

Safari on iOS doesn’t support Chrome MV3 extensions. This repo includes:

- `adapters/ios/blocker/blocker.json`: Safari content-blocker rules that hide Shorts UI elements.
- `adapters/ios/pwa/`: a small PWA settings/stats shell (hide-only semantics; no true redirect).

To actually use `blocker.json` you’d package it into an iOS Safari content-blocker extension (outside the scope of this repo).

## Privacy / Safety

- No accounts, no analytics, no remote servers.
- Settings live in `chrome.storage.sync` (Chrome) or `localStorage` (iOS PWA).
- Stats live in `chrome.storage.local` (Chrome) or `localStorage` (iOS PWA).
- Network blocking is done via Chrome’s `declarativeNetRequest` rulesets.
