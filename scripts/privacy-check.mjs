import fs from "node:fs/promises";
import path from "node:path";

const ROOTS = [
  "adapters",
  "content_scripts",
  "core",
  "platform",
  "policy",
  "runtime",
  "storage"
];

const NETWORK_PATTERNS = [
  /fetch\s*\(/,
  /XMLHttpRequest/,
  /navigator\.sendBeacon/,
  /sendBeacon\s*\(/,
  /WebSocket/,
  /EventSource/,
  /chrome\.runtime\.sendMessageExternal/,
  /chrome\.runtime\.connectExternal/
];

async function listFiles(dir) {
  const out = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...await listFiles(full));
    } else if (entry.isFile() && /\.(js|mjs|html|css)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

async function main() {
  const files = [];
  for (const root of ROOTS) {
    try {
      files.push(...await listFiles(root));
    } catch {}
  }

  const hits = [];
  for (const file of files) {
    const text = await fs.readFile(file, "utf8");
    for (const pattern of NETWORK_PATTERNS) {
      if (pattern.test(text)) {
        hits.push({ file, pattern: pattern.toString() });
      }
    }
  }

  if (hits.length) {
    console.error("privacy-check: unexpected network APIs found");
    hits.forEach((hit) => console.error(`- ${hit.file}: ${hit.pattern}`));
    process.exit(1);
  }

  console.log("privacy-check: ok");
}

main().catch((err) => {
  console.error("privacy-check: failed", err);
  process.exit(1);
});
