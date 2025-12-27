#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="$ROOT/dist"
OUT_ZIP="$OUT_DIR/ShortStopper-chrome.zip"

mkdir -p "$OUT_DIR"
rm -f "$OUT_ZIP"

cd "$ROOT"

zip -r "$OUT_ZIP" \
  adapters core policy runtime storage platform assets rules content_scripts ui \
  manifest.json service_worker.js README.md PRIVACY.md SECURITY.md \
  -x \
  "_metadata/*" \
  "adapters/ios/*" \
  "dist/*" \
  ".git/*" \
  ".github/*" \
  "scripts/*"

echo "Created: $OUT_ZIP"
