import assert from "node:assert/strict";
import { resolveRoutePolicy, shouldBlockRoute } from "../policy/decision.js";
import { resolveEffectiveSettings } from "../policy/settings_policy.js";
import { DEFAULT_SETTINGS } from "../storage/settings.js";

function makeEffective(overrides = {}) {
    const settings = { ...DEFAULT_SETTINGS, ...overrides };
    return resolveEffectiveSettings(settings, null);
}

console.log("Running Fix Verification Tests...");

// 1. Test YouTube Shorts Redirect (The Regression Fix)
{
    const siteId = "youtube";
    const url = "https://www.youtube.com/shorts/dQw4w9WgXcQ";
    const pathname = "/shorts/dQw4w9WgXcQ";

    const policy = resolveRoutePolicy(siteId, url, pathname);

    assert.equal(policy.action, "block", "YouTube Shorts should be blocked");
    assert.equal(policy.convertUrl, "/watch?v=dQw4w9WgXcQ",
        "YouTube Shorts should have a convertUrl to Watch page (relative URL)");

    const effective = makeEffective();
    const decision = shouldBlockRoute(effective, policy, siteId, url);

    assert.equal(decision.block, true, "Should block route");
    assert.equal(decision.redirectUrl, "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        "Decision should use the convertUrl for redirect");

    console.log("✅ YouTube Shorts convertUrl logic verified.");
}

// 2. Test Instagram Reels (No convertUrl expected)
{
    const siteId = "instagram";
    const url = "https://www.instagram.com/reel/C12345/";
    const pathname = "/reel/C12345/";

    const policy = resolveRoutePolicy(siteId, url, pathname);

    assert.equal(policy.action, "block", "Instagram Reel should be blocked");
    assert.ok(!policy.convertUrl, "Instagram should NOT have convertUrl (redirects to home/default)");

    const effective = makeEffective();
    const decision = shouldBlockRoute(effective, policy, siteId, url);

    assert.equal(decision.block, true, "Should block route");
    assert.ok(!decision.redirectUrl, "Instagram decision should NOT have a specific redirectUrl from policy");

    console.log("✅ Instagram Reels logic verified.");
}

// 3. Test TikTok Logic (New Support)
{
    const siteId = "tiktok";

    // Video Link
    const urlVideo = "https://www.tiktok.com/@user/video/7123456789";
    const pathVideo = "/@user/video/7123456789";
    const policyVideo = resolveRoutePolicy(siteId, urlVideo, pathVideo);
    assert.equal(policyVideo.action, "block", "TikTok video should be blocked");

    // FYP
    const urlFyp = "https://www.tiktok.com/foryou";
    const pathFyp = "/foryou";
    const policyFyp = resolveRoutePolicy(siteId, urlFyp, pathFyp);
    assert.equal(policyFyp.action, "block", "TikTok FYP should be blocked");

    // Profile (Should Allow)
    const urlProfile = "https://www.tiktok.com/@user";
    const pathProfile = "/@user";
    const policyProfile = resolveRoutePolicy(siteId, urlProfile, pathProfile);
    assert.equal(policyProfile.action, "allow", "TikTok profile should be allowed");

    console.log("✅ TikTok logic verified.");
}

console.log("ALL TESTS PASSED");
