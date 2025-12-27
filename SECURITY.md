# Security

## Threat model summary
- Web pages are untrusted and may try to exploit message passing, DOM injection, or storage.
- Extension assets to protect: user settings, block stats, and ruleset state.
- Trust boundaries: page ↔ content script ↔ service worker ↔ extension pages.

## Permission rationale
- `storage`: store settings in `chrome.storage.sync` and local stats in `chrome.storage.local`.
- `tabs`: read the active tab in the popup and open stats/options pages.
- `declarativeNetRequest`: optional ruleset for strict Shorts redirect and basic ad/tracker blocking.
- `host_permissions`: only the supported short-form sites; used for content script injection and route checks.
- `optional_host_permissions` (ad/tracker domains): only requested when enabling the optional ad/tracker blocker.
- `optional_permissions` (`declarativeNetRequestFeedback`): only requested when enabling adblock insights to read matched rule info.

## Reporting vulnerabilities
Please open a GitHub Security Advisory for this repo if available. If not, file a private issue with
"Security" in the title and include steps to reproduce.

## Safe development notes
- Do not add remote script sources or `unsafe-eval`.
- Keep permissions scoped to the minimum set of supported domains.
- Treat data from storage and pages as untrusted; validate before use.
- If adblock insights are enabled, store only domain counts locally (no URLs) and trim history.
- Use `node scripts/privacy-check.mjs` before release to scan for network APIs.
