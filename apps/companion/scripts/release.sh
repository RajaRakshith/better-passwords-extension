#!/bin/sh
# Builds, signs, notarizes and zips the companion for a release. Run by semantic-release in CI.
#
# Usage: scripts/release.sh VERSION
#
# Env (from repository secrets):
#   MACOS_SIGN_IDENTITY       e.g. "Developer ID Application: Name (TEAMID)", already in the keychain
#   NOTARY_KEY_PATH           App Store Connect API key (.p8) for notarytool
#   NOTARY_KEY_ID, NOTARY_ISSUER

set -eu
cd "$(dirname "$0")/.."

version="${1:?usage: release.sh VERSION}"
: "${MACOS_SIGN_IDENTITY:?Developer ID signing is required for a release}"
: "${NOTARY_KEY_PATH:?notarization is required for a release}"
: "${NOTARY_KEY_ID:?}"
: "${NOTARY_ISSUER:?}"

scripts/bundle.sh --version "$version" --sign "$MACOS_SIGN_IDENTITY"

app="dist/Better Passwords.app"
zip="dist/better-passwords-$version-mac.zip"

# notarize a zip of the app, then staple the ticket to the app and zip it again for download
ditto -c -k --keepParent "$app" "$zip"
xcrun notarytool submit "$zip" --key "$NOTARY_KEY_PATH" --key-id "$NOTARY_KEY_ID" --issuer "$NOTARY_ISSUER" --wait
xcrun stapler staple "$app"
rm "$zip"
ditto -c -k --keepParent "$app" "$zip"
spctl --assess --type execute --verbose "$app"

echo "released $zip"
