# Privacy Policy

**ShortStopper does not collect, transmit, or sell any personal data.**

## Data storage

All data is stored locally on your device:

| Data | Location | Purpose |
|------|----------|---------|
| Settings | `chrome.storage.sync` | Your preferences (synced across Chrome instances) |
| Stats | `chrome.storage.local` | Block counts and trends |
| Adblock history | `chrome.storage.local` | Domain-only counts (no URLs) |

## What we don't do

- ❌ No external network requests
- ❌ No third-party analytics
- ❌ No fingerprinting
- ❌ No data sharing
- ❌ No accounts required

## Permissions explained

| Permission | Why it's needed |
|------------|-----------------|
| `storage` | Save your settings and stats locally |
| `tabs` | Read active tab for popup display |
| `declarativeNetRequest` | Block short-form routes and optional ads |
| `host_permissions` | Only the supported platforms (YouTube, Instagram, etc.) |

Optional permissions for ad blocking are only requested when you enable that feature.
