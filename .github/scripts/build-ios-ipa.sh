#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."
if [[ "$(uname -s)" != "Darwin" ]]; then
  echo 'Building an iOS device IPA requires macOS and Xcode.' >&2
  exit 1
fi

output="$PWD/build/ios"
mkdir -p "$output"
workspace=$(find "$PWD/ios" -maxdepth 1 -name '*.xcworkspace' -type d -print -quit)
if [[ -z "$workspace" ]]; then
  echo 'Run Expo Prebuild and pod install before building the IPA.' >&2
  exit 1
fi
scheme=$(basename "$workspace" .xcworkspace)
version=$(node -p "require('./app.json').expo.version")
ipa="gatenest-v${version}-unsigned.ipa"

xcodebuild archive \
  -workspace "$workspace" \
  -scheme "$scheme" \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath "$output/GateNest.xcarchive" \
  -derivedDataPath "$output/DerivedData" \
  CODE_SIGNING_ALLOWED=NO \
  CODE_SIGNING_REQUIRED=NO \
  CODE_SIGN_IDENTITY= \
  DEVELOPMENT_TEAM= \
  | tee "$output/xcodebuild.log"

app=$(find "$output/GateNest.xcarchive/Products/Applications" -maxdepth 1 -name '*.app' -type d -print -quit)
if [[ -z "$app" ]]; then
  echo 'Xcode did not produce an application bundle.' >&2
  exit 1
fi
node .github/scripts/verify-ios-app.mjs "$app" "$output/ios-verification.json"

# A device archive can be packaged without an Apple signing identity for later re-signing.
staging=$(mktemp -d "$output/package.XXXXXX")
trap 'rm -rf "$staging"' EXIT
mkdir -p "$staging/Payload"
ditto "$app" "$staging/Payload/$(basename "$app")"
ditto -c -k --keepParent "$staging/Payload" "$output/$ipa"
unzip -tq "$output/$ipa"
(cd "$output" && shasum -a 256 "$ipa" > "$ipa.sha256")

if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
  {
    echo '## GateNest iOS IPA'
    echo
    echo "- File: $ipa"
    echo '- Target: iPhone and iPad, iOS 16.0 or later, arm64 device build.'
    echo '- Signing: unsigned; re-sign using a valid P12 (with private key) and matching provisioning profile before installation.'
    echo '- Includes the Release JavaScript bundle; no Metro server is required.'
    echo '- See docs/IOS_INSTALL.zh-CN.md for ESign and i4Tools installation.'
  } >> "$GITHUB_STEP_SUMMARY"
fi
echo "IPA ready: $output/$ipa"
