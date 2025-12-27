# Release Sign-off

## Summary
- Target: ShortStopper MV3 extension
- Scope: Shorts/Reels redirect to home, site toggles, allowlist and per-channel modes, optional adblock

## Automated checks (latest run)
- `node scripts/test-policy.mjs` - ok
- `node scripts/accuracy-check.mjs` - ok
- `node scripts/adblock-check.mjs` - ok

## Manual QA
- [ ] Completed on: YYYY-MM-DD
- [ ] Tester: name
- [ ] Notes:

## Known risks
- Sites may change SPA routing or markup, which can affect route detection.
- Adblock coverage is intentionally limited to a small curated ruleset.

## Release decision
- [ ] Approved for release
- [ ] Hold for fixes
