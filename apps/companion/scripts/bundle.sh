#!/bin/sh
# Builds "Apple Passwords Plus.app" into apps/companion/dist.
#
# Usage: scripts/bundle.sh [--version X.Y.Z] [--sign "Developer ID Application: Name (TEAMID)"]
#
# Without --sign the app is signed ad hoc, for local testing only. An ad-hoc agent trusts only the
# exact native host built with it (pinned by cdhash); a Developer ID build trusts its own team.

set -eu
cd "$(dirname "$0")/.."

version="0.0.0"
identity="-"
while [ $# -gt 0 ]; do
    case "$1" in
        --version) version="$2"; shift ;;
        --sign) identity="$2"; shift ;;
        -h | --help) sed -n '2,8p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
        *) echo "unknown option: $1" >&2; exit 2 ;;
    esac
    shift
done

swift build -c release --arch arm64 --arch x86_64
bin="$(swift build -c release --arch arm64 --arch x86_64 --show-bin-path)"

app="dist/Apple Passwords Plus.app"
host="$app/Contents/MacOS/apple-passwords-plus-host"
rm -rf "$app"
mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources" "$app/Contents/Library/LaunchAgents"
cp "$bin/ApplePasswordsPlus" "$app/Contents/MacOS/"
cp "$bin/apple-passwords-plus-host" "$host"
cp Resources/Info.plist "$app/Contents/Info.plist"
cp Resources/org.applepasswordsplus.agent.plist "$app/Contents/Library/LaunchAgents/"
plutil -replace CFBundleShortVersionString -string "$version" "$app/Contents/Info.plist"
plutil -replace CFBundleVersion -string "$version" "$app/Contents/Info.plist"

iconset="$(mktemp -d)/AppIcon.iconset"
swift scripts/make-iconset.swift ../extension/assets/icon.svg "$iconset"
iconutil -c icns -o "$app/Contents/Resources/AppIcon.icns" "$iconset"
rm -rf "$(dirname "$iconset")"

if [ "$identity" = "-" ]; then
    set -- --force --sign - --timestamp=none
else
    set -- --force --sign "$identity" --options runtime --timestamp
fi

# The host first: an ad-hoc app pins the host's exact build, so its hash goes into Info.plist
# before the app itself is signed.
codesign "$@" --identifier org.applepasswordsplus.companion.host "$host"
if [ "$identity" = "-" ]; then
    cdhash="$(codesign -dvvv "$host" 2>&1 | sed -n 's/^CDHash=//p')"
    plutil -insert APPHostCDHash -string "$cdhash" "$app/Contents/Info.plist"
fi
codesign "$@" "$app"
codesign --verify --strict --deep "$app"

echo "built $app ($version, signed: $identity)"
