<p align="center">
  <img src="assets/logo.png" alt="ShortStopper" width="128" height="128">
</p>

<h1 align="center">ShortStopper</h1>

<p align="center">
  <strong>Block short-form video feeds without breaking normal browsing.</strong>
</p>

<p align="center">
  <a href="https://github.com/Sappgulf/ShortStopper/archive/refs/heads/main.zip">Download ZIP</a> •
  <a href="#install">Install</a> •
  <a href="#features">Features</a> •
  <a href="#privacy">Privacy</a>
</p>

---

## What it does

ShortStopper blocks short-form video feeds across major platforms while keeping the rest of the site fully functional.

**Supported platforms:**
- YouTube Shorts
- Instagram Reels
- Facebook Reels
- TikTok
- Snapchat Spotlight
- Pinterest Watch

## Install

### Chrome (Recommended)

1. [Download the ZIP](https://github.com/Sappgulf/ShortStopper/archive/refs/heads/main.zip)
2. Unzip the downloaded file
3. Open `chrome://extensions` in Chrome
4. Enable **Developer mode** (toggle in top right)
5. Click **Load unpacked**
6. Select the unzipped `ShortStopper-main` folder

> **Note:** Chrome requires Developer mode for extensions not from the Web Store. This is the standard way to install unpacked extensions.

## Features

### Core blocking
- **Smart route detection** — Blocks short-form feeds while allowing normal watch pages, search results, and profiles
- **Overlay-first blocking** — Prevents redirect loops and keeps SPA navigation stable
- **Per-site toggles** — Enable/disable blocking for each platform individually

### YouTube extras
- **Allowlist mode** — Block Shorts everywhere except channels you whitelist
- **Per-channel overrides** — Fine-grained control for specific channels

### Stats & insights
- **Local stats** — Track how many short-form items have been blocked
- **Optional ad/tracker blocking** — Basic ad blocker with permission-gated domains
- **Adblock insights** — See blocked request counts (domains only, no URLs stored)

## How it works

1. Content script monitors SPA navigation and URL changes
2. Routes are classified using a centralized policy
3. Short-form routes trigger a redirect to the site's home page
4. CSS rules hide Shorts shelves, links, and nav entries
5. Optional DNR rules provide strict redirect and ad blocking

## Privacy

**ShortStopper does not collect, transmit, or sell any data.**

- All settings stored locally in `chrome.storage.sync`
- All stats stored locally in `chrome.storage.local`
- No external network requests
- No analytics or tracking
- No accounts required

See [PRIVACY.md](PRIVACY.md) for details.

## Security

- Manifest V3 architecture
- Strict Content Security Policy
- Minimal permissions (only requested sites)
- Optional permissions for ad blocking (user must approve)
- All data validated before use

See [SECURITY.md](SECURITY.md) for details.

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) before submitting changes.

## License

MIT
