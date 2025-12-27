# Release Checklist

## Pre-release
- [ ] Bump version in `manifest.json` if releasing a new build.
- [ ] Reload the unpacked extension in Chrome and confirm there are no errors in `chrome://extensions`.

## Automated checks
- [ ] `node scripts/test-policy.mjs`
- [ ] `node scripts/accuracy-check.mjs`
- [ ] `node scripts/adblock-check.mjs`
- [ ] `node scripts/privacy-check.mjs`

## Manual QA (Chrome)
- [ ] YouTube search results and watch pages load without redirects.
- [ ] YouTube Shorts routes redirect home: `/shorts`, `/shorts/{id}`, `/feed/shorts`, channel Shorts tab.
- [ ] Instagram `/reels` and `/reel/{id}` redirect home; `/p/{id}` and profiles load.
- [ ] Toggle each site in Options and verify behavior changes on that site.
- [ ] Toggle allowlist and per-channel overrides; confirm the mode changes take effect.

## Adblock verification
- [ ] Enable "Block ads/trackers (basic)" and grant the ad/tracker domain permissions.
- [ ] Options shows "Adblock: active" with permission granted and ruleset enabled.
- [ ] Verify a known tracker request is blocked in DevTools Network (e.g., `doubleclick`).

## Packaging
- [ ] Run `bash scripts/package-chrome.sh`.
- [ ] Test the ZIP in a fresh Chrome profile.

## Post-release
- [ ] Tag the release and attach the ZIP.
- [ ] Update release notes with highlights and known limits.
