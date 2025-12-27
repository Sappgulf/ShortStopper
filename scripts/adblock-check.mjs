import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { ADBLOCK_HOSTS } from "../policy/adblock_hosts.js";
import { DEFAULT_SETTINGS } from "../storage/settings.js";

const manifest = JSON.parse(await fs.readFile("manifest.json", "utf8"));

assert(
  Array.isArray(manifest.permissions) && manifest.permissions.includes("declarativeNetRequest"),
  "manifest.json must include declarativeNetRequest permission"
);
assert(
  Array.isArray(manifest.optional_host_permissions) && manifest.optional_host_permissions.length > 0,
  "manifest.json must include optional host permissions for adblock"
);
assert(
  !manifest.optional_host_permissions.includes("<all_urls>"),
  "manifest.json optional host permissions must not include <all_urls>"
);

const manifestHosts = new Set(manifest.optional_host_permissions);
const expectedHosts = new Set(ADBLOCK_HOSTS);
for (const host of expectedHosts) {
  assert(manifestHosts.has(host), `missing optional host permission: ${host}`);
}
for (const host of manifestHosts) {
  assert(expectedHosts.has(host), `unexpected optional host permission: ${host}`);
}

assert(
  Array.isArray(manifest.optional_permissions) &&
    manifest.optional_permissions.includes("declarativeNetRequestFeedback"),
  "manifest.json must include optional permission declarativeNetRequestFeedback"
);
assert(
  "adBlockEnabled" in DEFAULT_SETTINGS,
  "DEFAULT_SETTINGS must include adBlockEnabled"
);

const rulesets = manifest.declarative_net_request?.rule_resources || [];
const basic = rulesets.find((r) => r.id === "basic_block");
assert(basic, "manifest.json must include a basic_block ruleset");
assert(
  basic.path === "rules/basic_block.json",
  "basic_block ruleset path must be rules/basic_block.json"
);

const rules = JSON.parse(await fs.readFile(basic.path, "utf8"));
assert(Array.isArray(rules) && rules.length > 0, "basic_block ruleset must be a non-empty array");

const seenIds = new Set();
for (const rule of rules) {
  assert(Number.isInteger(rule.id), `rule id must be an integer (got ${rule.id})`);
  assert(!seenIds.has(rule.id), `duplicate rule id ${rule.id}`);
  seenIds.add(rule.id);

  assert(rule.action?.type === "block", `rule ${rule.id} must use action.type=block`);

  const cond = rule.condition || {};
  assert(
    cond.regexFilter || cond.urlFilter,
    `rule ${rule.id} must include regexFilter or urlFilter`
  );
  if (cond.regexFilter) {
    try {
      new RegExp(cond.regexFilter);
    } catch (err) {
      throw new Error(`rule ${rule.id} has invalid regexFilter: ${err.message}`);
    }
  }
  assert(
    Array.isArray(cond.resourceTypes) && cond.resourceTypes.length > 0,
    `rule ${rule.id} must include resourceTypes`
  );
}

console.log("adblock checks: ok");
