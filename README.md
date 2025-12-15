# ShortStopper (No Shorts Companion)

A lightweight MV3 extension that blocks YouTube Shorts (hide + redirect-to-Home) with per-channel allow/override modes, plus local stats. Includes an optional basic ad/tracker blocker (Chrome-only, permission-gated).

## Install (Chrome)

1. Download the repo.
2. Open `chrome://extensions` and enable **Developer mode**.
3. Click **Load unpacked** and select the repo folder.
4. Pin the extension (optional).

## Use

- **Redirect Shorts → Home**: when enabled, `/shorts/*` and `/feed/shorts` are immediately blocked and you’re sent to Home.
- **Whitelist mode**: blocks Shorts everywhere except channels you add to the whitelist (per-channel overrides still apply).
- **Stats**: counts blocked items and shows a simple trend + top channels.
- **Block ads/trackers (basic)**: enables a small DNR blocklist. When you turn it on, Chrome will prompt for `<all_urls>` host access so it can work across the web.

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

