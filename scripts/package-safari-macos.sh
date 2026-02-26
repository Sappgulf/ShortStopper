#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_ROOT="$ROOT/dist/safari-macos"
PROJECT_LOCATION="$DIST_ROOT/project"
APP_NAME="ShortStopperSafari"
BUNDLE_ID="com.shortstopper.safari"
LANGUAGE_FLAG="--swift"
BUILD_AFTER_CONVERT=1
KEEP_STAGE=0
CONFIGURATION="Release"

usage() {
  cat <<'EOF'
Usage: scripts/package-safari-macos.sh [options]

Build a macOS Safari Web Extension wrapper from the current extension source.

Options:
  --app-name NAME         Generated macOS app name (default: ShortStopperSafari)
  --bundle-id ID          App bundle identifier (default: com.shortstopper.safari)
  --project-location DIR  Output directory for generated Xcode project
  --dist-dir DIR          Base output directory (default: dist/safari-macos)
  --objc                  Generate Objective-C host app instead of Swift
  --swift                 Generate Swift host app (default)
  --no-build              Generate Xcode project only (skip xcodebuild)
  --configuration NAME    Xcode build configuration (default: Release)
  --keep-stage            Keep temporary staged web extension source for debugging
  -h, --help              Show this help

Examples:
  scripts/package-safari-macos.sh
  scripts/package-safari-macos.sh --bundle-id com.example.shortstopper --app-name ShortStopper
  scripts/package-safari-macos.sh --no-build
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --app-name)
      APP_NAME="$2"
      shift 2
      ;;
    --bundle-id)
      BUNDLE_ID="$2"
      shift 2
      ;;
    --project-location)
      PROJECT_LOCATION="$2"
      shift 2
      ;;
    --dist-dir)
      DIST_ROOT="$2"
      PROJECT_LOCATION="$DIST_ROOT/project"
      shift 2
      ;;
    --objc)
      LANGUAGE_FLAG="--objc"
      shift
      ;;
    --swift)
      LANGUAGE_FLAG="--swift"
      shift
      ;;
    --no-build)
      BUILD_AFTER_CONVERT=0
      shift
      ;;
    --configuration)
      CONFIGURATION="$2"
      shift 2
      ;;
    --keep-stage)
      KEEP_STAGE=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if ! command -v xcrun >/dev/null 2>&1; then
  echo "xcrun not found. Install Xcode command line tools / Xcode first." >&2
  exit 1
fi

if ! xcrun --find safari-web-extension-converter >/dev/null 2>&1; then
  echo "safari-web-extension-converter not found in Xcode. Install/update Xcode." >&2
  exit 1
fi

INCLUDE_PATHS=(
  adapters
  assets
  core
  platform
  policy
  rules
  runtime
  storage
  ui
  manifest.json
  service_worker.js
  README.md
  PRIVACY.md
  SECURITY.md
)

STAGE_DIR="$(mktemp -d "${TMPDIR:-/tmp}/shortstopper-safari-src.XXXXXX")"
cleanup() {
  if [[ "$KEEP_STAGE" -eq 0 ]]; then
    rm -rf "$STAGE_DIR"
  fi
}
trap cleanup EXIT

mkdir -p "$DIST_ROOT"

for rel in "${INCLUDE_PATHS[@]}"; do
  rsync -a "$ROOT/$rel" "$STAGE_DIR/"
done

# Safari warns about these Chrome-specific manifest keys; strip them from the staged copy.
TMP_MANIFEST="$STAGE_DIR/manifest.safari.json"
jq '
  del(.background.type)
  | .web_accessible_resources = ((.web_accessible_resources // []) | map(del(.use_dynamic_url)))
' "$STAGE_DIR/manifest.json" > "$TMP_MANIFEST"
mv "$TMP_MANIFEST" "$STAGE_DIR/manifest.json"

echo "Staged extension source: $STAGE_DIR"
echo "Generating Safari macOS project..."

xcrun safari-web-extension-converter "$STAGE_DIR" \
  --project-location "$PROJECT_LOCATION" \
  --app-name "$APP_NAME" \
  --bundle-identifier "$BUNDLE_ID" \
  $LANGUAGE_FLAG \
  --macos-only \
  --copy-resources \
  --no-open \
  --no-prompt \
  --force

XCODEPROJ="$(find "$PROJECT_LOCATION" -name '*.xcodeproj' -maxdepth 3 -print -quit)"
if [[ -z "$XCODEPROJ" ]]; then
  echo "Failed to locate generated Xcode project under: $PROJECT_LOCATION" >&2
  exit 1
fi

echo "Generated Xcode project: $XCODEPROJ"

PBXPROJ="$XCODEPROJ/project.pbxproj"
if [[ -f "$PBXPROJ" ]]; then
  CURRENT_EXT_IDS=()
  while IFS= read -r line; do
    [[ -n "$line" ]] && CURRENT_EXT_IDS+=("$line")
  done < <(rg -o 'PRODUCT_BUNDLE_IDENTIFIER = [^;]+\.Extension;' "$PBXPROJ" \
    | sed -E 's/.*= ([^;]+);/\1/' \
    | sort -u)

  CURRENT_APP_IDS=()
  while IFS= read -r line; do
    [[ -n "$line" ]] && CURRENT_APP_IDS+=("$line")
  done < <(rg -o 'PRODUCT_BUNDLE_IDENTIFIER = [^;]+;' "$PBXPROJ" \
    | sed -E 's/.*= ([^;]+);/\1/' \
    | rg -v '\.Extension$' \
    | sort -u)

  TARGET_APP_ID="$BUNDLE_ID"
  TARGET_EXT_ID="$TARGET_APP_ID.Extension"

  for id in "${CURRENT_APP_IDS[@]}"; do
    [[ -z "$id" ]] && continue
    sed -i '' "s|PRODUCT_BUNDLE_IDENTIFIER = $id;|PRODUCT_BUNDLE_IDENTIFIER = $TARGET_APP_ID;|g" "$PBXPROJ"
  done
  for id in "${CURRENT_EXT_IDS[@]}"; do
    [[ -z "$id" ]] && continue
    sed -i '' "s|PRODUCT_BUNDLE_IDENTIFIER = $id;|PRODUCT_BUNDLE_IDENTIFIER = $TARGET_EXT_ID;|g" "$PBXPROJ"
  done

  echo "Patched bundle IDs in project:"
  echo "  App: $TARGET_APP_ID"
  echo "  Extension: $TARGET_EXT_ID"
fi

if [[ "$BUILD_AFTER_CONVERT" -eq 0 ]]; then
  echo "Skipped xcodebuild (--no-build)."
  exit 0
fi

DERIVED_DATA="$DIST_ROOT/DerivedData"
mkdir -p "$DERIVED_DATA"

echo "Building macOS app (unsigned)..."
xcodebuild \
  -quiet \
  -project "$XCODEPROJ" \
  -scheme "$APP_NAME" \
  -configuration "$CONFIGURATION" \
  -destination "platform=macOS" \
  -derivedDataPath "$DERIVED_DATA" \
  CODE_SIGNING_ALLOWED=NO \
  build

APP_PATH="$(find "$DERIVED_DATA/Build/Products/$CONFIGURATION" -name "$APP_NAME.app" -maxdepth 3 -print -quit)"
if [[ -z "$APP_PATH" ]]; then
  echo "Build completed but app bundle was not found in DerivedData output." >&2
  exit 1
fi

ZIP_PATH="$DIST_ROOT/${APP_NAME}-macOS-unsigned.zip"
rm -f "$ZIP_PATH"
ditto -c -k --sequesterRsrc --keepParent "$APP_PATH" "$ZIP_PATH"

echo "Built app: $APP_PATH"
echo "Zipped app: $ZIP_PATH"
echo "Note: This is an unsigned build. Sign it in Xcode for local use/distribution."
