# ShortStopper Landing Page

Static landing page for ShortStopper (no build step).

## Quick preview

- Open `site/index.html` in a browser.
- Optional: `npx serve site` then open the printed URL.

## Configure links

Edit `site/app.js` and set:

- `WEBSTORE_URL`
- `DOWNLOAD_ZIP_URL`
- `SOURCE_URL`

If a URL is empty, the button shows "Coming soon" and is disabled.

## Version + updated date

`site/app.js` tries to read `../manifest.json` first, then `site/manifest.json`.
If you want the version to always show on hosted pages, copy `manifest.json`
into `site/` (or update `MANIFEST_URLS`).

## GitHub Pages

Option A: Deploy `site/` as the root of a separate branch.

1. Copy `site/` contents into a `gh-pages` branch root.
2. Enable Pages in repo settings.

Option B: Configure Pages to serve `/site` if your repo supports it.

## Netlify

- Build command: none
- Publish directory: `site`

## Vercel

- Framework preset: Other
- Output directory: `site`

## Assets

`site/assets` reuses the extension icons from `assets/`.

