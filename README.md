# ShortStopper (No Shorts Companion)

A lightweight MV3 extension that blocks short-form video across YouTube Shorts, Instagram/Facebook Reels, TikTok, Snapchat Spotlight, and Pinterest Watch. Includes per-channel allow/override modes for YouTube, plus local stats and an optional basic ad/tracker blocker (Chrome-only, permission-gated).

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

- **Sites**: choose which short-form feeds to block (YouTube Shorts, Instagram Reels, Facebook Reels, TikTok, Snapchat Spotlight, Pinterest Watch).
- **Redirect short-form pages → Home**: when enabled, Shorts/Reels pages are blocked and you’re sent to Home.
- **Allowlist mode (YouTube only)**: blocks Shorts everywhere except channels you add to the allowlist (per-channel overrides still apply).
- **Stats**: counts blocked items and shows a simple trend + top sources.
- **Block ads/trackers (basic)**: enables a small DNR blocklist. When you turn it on, Chrome will prompt for permission to listed ad/tracker domains so it can block those requests across the web.
- **Adblock insights (optional)**: shows per-tab/video blocked request counts and top domains; requires an extra permission to read matched rule info. Domains are stored locally for a short history (no URLs).

## Architecture

- `policy/`: route classification and decision logic.
- `runtime/`: SPA navigation hooks, caches, and session gates.
- `ui/`: DOM flags for CSS and UI helpers.
- `storage/`: settings schema + validation and stats helpers.
- `platform/`: thin wrappers for `chrome.*` APIs.
- `adapters/`: Chrome and iOS entrypoints plus platform-specific storage.

## How blocking works

- The content script listens to SPA navigation and URL changes, then classifies the route.
- If the route is short-form, it redirects to the site home page.
- CSS flags hide shelves/links/nav entries as configured.
- Optional DNR rules can redirect YouTube Shorts feeds and block ads/trackers when enabled.

## Testing

- Run policy checks: `node scripts/test-policy.mjs`
- Manual QA (Chrome):
- YouTube `/results`, `/watch`, `/channel`, `/@handle` should not be blocked.
- YouTube `/shorts`, `/feed/shorts`, and `/shorts/{id}` should redirect to Home.
- Instagram `/reels` and `/reel/{id}` should redirect to Home; `/p/{id}` should load.

## Debug logging

- In the target tab DevTools console: `sessionStorage.setItem("ns_debug","1")` then reload.
- Disable with: `sessionStorage.removeItem("ns_debug")`.

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
