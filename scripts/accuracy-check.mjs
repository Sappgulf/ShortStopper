import assert from "node:assert/strict";
import { resolveRoutePolicy, shouldBlockRoute } from "../policy/decision.js";
import { resolveEffectiveSettings } from "../policy/settings_policy.js";
import { DEFAULT_SETTINGS } from "../storage/settings.js";

function policyFor(siteId, url) {
  const u = new URL(url);
  return resolveRoutePolicy(siteId, url, u.pathname);
}

const CASES = [
  ["youtube", "https://www.youtube.com/results?search=shorts", "allow"],
  ["youtube", "https://www.youtube.com/watch?v=abc", "allow"],
  ["youtube", "https://www.youtube.com/shorts", "block"],
  ["youtube", "https://www.youtube.com/shorts/abc", "block"],
  ["youtube", "https://www.youtube.com/feed/shorts", "block"],
  ["youtube", "https://www.youtube.com/@creator/shorts", "block"],
  ["youtube", "https://www.youtube.com/channel/UC123/shorts", "block"],
  ["instagram", "https://www.instagram.com/", "allow"],
  ["instagram", "https://www.instagram.com/p/xyz", "allow"],
  ["instagram", "https://www.instagram.com/reel/xyz", "block"],
  ["instagram", "https://www.instagram.com/reels", "block"],
  ["instagram", "https://www.instagram.com/explore/reels", "block"],
  ["instagram", "https://www.instagram.com/someuser", "allow"],
  ["instagram", "https://www.instagram.com/someuser/reels", "block"],
  ["facebook", "https://www.facebook.com/reels", "block"],
  ["facebook", "https://www.facebook.com/reel/abc", "block"],
  ["snapchat", "https://www.snapchat.com/spotlight", "block"],
  ["pinterest", "https://www.pinterest.com/watch/abc", "block"],
  ["tiktok", "https://www.tiktok.com/@user/video/123", "block"]
];

for (const [siteId, url, expected] of CASES) {
  const policy = policyFor(siteId, url);
  assert.equal(
    policy.action,
    expected,
    `${siteId} ${url} => ${policy.action} (expected ${expected})`
  );
}

const effective = resolveEffectiveSettings(DEFAULT_SETTINGS, null);
const blockedPolicy = policyFor("youtube", "https://www.youtube.com/shorts/abc");
assert.equal(
  shouldBlockRoute(effective, blockedPolicy, "youtube").block,
  true,
  "default settings should block short-form routes"
);

const noRedirect = resolveEffectiveSettings({ ...DEFAULT_SETTINGS, redirectShorts: false }, null);
assert.equal(
  shouldBlockRoute(noRedirect, blockedPolicy, "youtube").block,
  false,
  "redirect off should not block"
);

console.log("accuracy checks: ok");
