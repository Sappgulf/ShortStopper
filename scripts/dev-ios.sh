#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_ROOT="$ROOT/dist/ios"
PROJECT_LOCATION="$ROOT/adapters/ios/project"
APP_NAME="ShortStopperSafariIOS"
BUNDLE_ID="com.shortstopper.safari.ios"
LANGUAGE_FLAG="--swift"
BUILD_AFTER_CONVERT=1
CONFIGURATION="Debug"
OPEN_AFTER_CONVERT=1

usage() {
    cat <<'EOF'
Usage: scripts/dev-ios.sh [options]

Generate and build an iOS Safari Web Extension wrapper from the current extension source,
then open the Xcode project.

Options:
  --app-name NAME         Generated iOS app name (default: ShortStopperSafariIOS)
  --bundle-id ID          App bundle identifier (default: com.shortstopper.safari.ios)
  --project-location DIR  Output directory for generated Xcode project
  --dist-dir DIR          Base output directory (default: dist/ios)
  --objc                  Generate Objective-C host app instead of Swift
  --swift                 Generate Swift host app (default)
  --no-build              Generate Xcode project only (skip xcodebuild)
  --no-open               Do not open Xcode project after generation
  --configuration NAME    Xcode build configuration (default: Debug)
  -h, --help              Show this help

Examples:
  scripts/dev-ios.sh
  scripts/dev-ios.sh --bundle-id com.example.shortstopper.ios --app-name ShortStopper
  scripts/dev-ios.sh --no-build
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
        --no-open)
            OPEN_AFTER_CONVERT=0
            shift
            ;;
        --configuration)
            CONFIGURATION="$2"
            shift 2
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

if ! command -v jq >/dev/null 2>&1; then
    echo "jq not found. Install jq to sanitize manifest for Safari." >&2
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

mkdir -p "$DIST_ROOT"
rm -rf "$DIST_ROOT/extension-src"
STAGE_DIR="$DIST_ROOT/extension-src"
mkdir -p "$STAGE_DIR"

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
echo "Generating iOS Safari Web Extension project..."

xcrun safari-web-extension-converter "$STAGE_DIR" \
    --project-location "$PROJECT_LOCATION" \
    --app-name "$APP_NAME" \
    --bundle-identifier "$BUNDLE_ID" \
    $LANGUAGE_FLAG \
    --ios-only \
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
    done < <(/usr/bin/grep -Eo 'PRODUCT_BUNDLE_IDENTIFIER = [^;]+\.Extension;' "$PBXPROJ" \
        | /usr/bin/sed -E 's/.*= ([^;]+);/\1/' \
        | /usr/bin/sort -u)

    CURRENT_APP_IDS=()
    while IFS= read -r line; do
        [[ -n "$line" ]] && CURRENT_APP_IDS+=("$line")
    done < <(/usr/bin/grep -Eo 'PRODUCT_BUNDLE_IDENTIFIER = [^;]+;' "$PBXPROJ" \
        | /usr/bin/sed -E 's/.*= ([^;]+);/\1/' \
        | /usr/bin/grep -Ev '\\.Extension$' \
        | /usr/bin/sort -u)

    TARGET_APP_ID="$BUNDLE_ID"
    TARGET_EXT_ID="$TARGET_APP_ID.Extension"

    for id in "${CURRENT_APP_IDS[@]}"; do
        [[ -z "$id" ]] && continue
        /usr/bin/sed -i '' "s|PRODUCT_BUNDLE_IDENTIFIER = $id;|PRODUCT_BUNDLE_IDENTIFIER = $TARGET_APP_ID;|g" "$PBXPROJ"
    done
    for id in "${CURRENT_EXT_IDS[@]}"; do
        [[ -z "$id" ]] && continue
        /usr/bin/sed -i '' "s|PRODUCT_BUNDLE_IDENTIFIER = $id;|PRODUCT_BUNDLE_IDENTIFIER = $TARGET_EXT_ID;|g" "$PBXPROJ"
    done

    echo "Patched bundle IDs in project:"
    echo "  App: $TARGET_APP_ID"
    echo "  Extension: $TARGET_EXT_ID"
fi

if [[ "$BUILD_AFTER_CONVERT" -eq 1 ]]; then
    DERIVED_DATA="$DIST_ROOT/DerivedData"
    mkdir -p "$DERIVED_DATA"

    echo "Building iOS app for Simulator (unsigned)..."
    xcodebuild \
        -quiet \
        -project "$XCODEPROJ" \
        -scheme "$APP_NAME" \
        -configuration "$CONFIGURATION" \
        -destination "generic/platform=iOS Simulator" \
        -derivedDataPath "$DERIVED_DATA" \
        CODE_SIGNING_ALLOWED=NO \
        build
fi

if [[ "$OPEN_AFTER_CONVERT" -eq 1 ]]; then
    open "$XCODEPROJ"
fi
