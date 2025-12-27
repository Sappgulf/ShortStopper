import assert from "node:assert/strict";
import { classifyRoute } from "../policy/route_policy.js";
import { resolveRoutePolicy, shouldBlockRoute } from "../policy/decision.js";
import { resolveEffectiveSettings } from "../policy/settings_policy.js";
import { DEFAULT_SETTINGS } from "../storage/settings.js";

function makeEffective(overrides = {}, channelKey = null) {
  const settings = { ...DEFAULT_SETTINGS, ...overrides };
  return resolveEffectiveSettings(settings, channelKey);
}

function testClassifyRoute() {
  assert.equal(
    classifyRoute("youtube", "https://www.youtube.com/watch?v=abc").action,
    "allow",
    "YouTube watch should be allowed"
  );
  assert.equal(
    classifyRoute("youtube", "https://www.youtube.com/shorts").action,
    "block",
    "YouTube /shorts feed should be blocked"
  );
  assert.equal(
    classifyRoute("youtube", "https://www.youtube.com/shorts/abc").action,
    "block",
    "YouTube /shorts/{id} should be blocked"
  );
  assert.equal(
    classifyRoute("instagram", "https://www.instagram.com/reels").action,
    "block",
    "Instagram reels feed should be blocked"
  );
  assert.equal(
    classifyRoute("instagram", "https://www.instagram.com/reel/xyz").action,
    "block",
    "Instagram /reel/{id} should be blocked"
  );
  assert.equal(
    classifyRoute("instagram", "https://www.instagram.com/p/xyz").action,
    "allow",
    "Instagram post should be allowed"
  );
}

function testShouldBlockRoute() {
  const policy = resolveRoutePolicy("youtube", "https://www.youtube.com/shorts", "/shorts");
  const effective = makeEffective();

  assert.equal(
    shouldBlockRoute(effective, policy, "youtube").block,
    true,
    "Blocked policy should block when enabled"
  );

  const noRedirect = makeEffective({ redirectShorts: false });
  assert.equal(
    shouldBlockRoute(noRedirect, policy, "youtube").block,
    false,
    "Redirect off should not block"
  );

  const hideOnly = makeEffective(
    { strictRedirect: false, channelOverrides: { "x": "hide" } },
    "x"
  );
  assert.equal(
    shouldBlockRoute(hideOnly, policy, "youtube").block,
    false,
    "Hide-only mode should not block when strict redirect is off"
  );
}

testClassifyRoute();
testShouldBlockRoute();
console.log("policy tests: ok");
