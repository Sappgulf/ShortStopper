# Security

## Architecture

ShortStopper uses Chrome's Manifest V3 architecture with strict security practices:

- **Strict CSP** — No remote scripts, no `unsafe-eval`
- **Minimal permissions** — Only the domains we need to block
- **Input validation** — All storage and page data is validated
- **No remote code** — Everything ships with the extension

## Permission model

| Permission | Scope | Rationale |
|------------|-------|-----------|
| `storage` | Extension only | Store settings and stats |
| `tabs` | Extension only | Read active tab info |
| `declarativeNetRequest` | Extension only | Block routes via Chrome's DNR API |
| `host_permissions` | Listed sites only | Content script injection |

Optional ad-blocking permissions are only requested when you enable that feature.

## Trust boundaries

```
Page ↔ Content Script ↔ Service Worker ↔ Extension Pages
```

- Web pages are untrusted
- Content scripts validate all page data
- Service worker validates all messages
- Extension pages use safe DOM APIs

## Reporting vulnerabilities

If you find a security issue:

1. **Do not** open a public issue
2. Open a [GitHub Security Advisory](https://github.com/Sappgulf/ShortStopper/security/advisories/new) (if available)
3. Or email with "Security" in the subject

Include steps to reproduce and any relevant details.
