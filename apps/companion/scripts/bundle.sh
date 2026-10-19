#!/bin/sh
# Builds "Better Passwords.app" into apps/companion/dist.
#
# Usage: scripts/bundle.sh [--version X.Y.Z] [--sign "Developer ID Application: Name (TEAMID)"]
#
# Without --sign the app is signed ad hoc, for local testing only. An ad-hoc agent trusts only the
# exact native host built with it (pinned by cdhash); a Developer ID build trusts its own team.
# Without --version it is a development build, which never updates itself.

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

app="dist/Better Passwords.app"
host="$app/Contents/MacOS/better-passwords-host"
rm -rf "$app"
mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources" "$app/Contents/Library/LaunchAgents" "$app/Contents/Frameworks"
cp "$bin/BetterPasswords" "$app/Contents/MacOS/"
install_name_tool -add_rpath @executable_path/../Frameworks "$app/Contents/MacOS/BetterPasswords"
sparkle="$app/Contents/Frameworks/Sparkle.framework"
ditto "$bin/Sparkle.framework" "$sparkle"
# Sparkle's XPC services are for sandboxed apps, which this one isn't
rm -rf "$sparkle/XPCServices" "$sparkle/Versions/B/XPCServices"
cp "$bin/better-passwords-host" "$host"
cp Resources/Info.plist "$app/Contents/Info.plist"
cp Resources/io.github.fanckush.betterpasswords.agent.plist "$app/Contents/Library/LaunchAgents/"
plutil -replace CFBundleShortVersionString -string "$version" "$app/Contents/Info.plist"
plutil -replace CFBundleVersion -string "$version" "$app/Contents/Info.plist"
# no appcast: a development build would offer to replace itself with the release
if [ "$version" = "0.0.0" ]; then plutil -remove SUFeedURL "$app/Contents/Info.plist"; fi

iconset="$(mktemp -d)/AppIcon.iconset"
swift scripts/make-iconset.swift ../extension/assets/icon.svg "$iconset"
iconutil -c icns -o "$app/Contents/Resources/AppIcon.icns" "$iconset"
rm -rf "$(dirname "$iconset")"

if [ "$identity" = "-" ]; then
    set -- --force --sign - --timestamp=none
else
    set -- --force --sign "$identity" --options runtime --timestamp
fi

# Inside out: Sparkle's helpers, then its framework.
codesign "$@" "$sparkle/Versions/B/Autoupdate"
codesign "$@" "$sparkle/Versions/B/Updater.app"
codesign "$@" "$sparkle"

# The host before the app: an ad-hoc app pins the host's exact build, so its hash goes into
# Info.plist before the app itself is signed.
codesign "$@" --identifier io.github.fanckush.betterpasswords.companion.host "$host"
if [ "$identity" = "-" ]; then
    cdhash="$(codesign -dvvv "$host" 2>&1 | sed -n 's/^CDHash=//p')"
    plutil -insert BPHostCDHash -string "$cdhash" "$app/Contents/Info.plist"
fi
codesign "$@" --entitlements Resources/BetterPasswords.entitlements "$app"
codesign --verify --strict --deep "$app"

echo "built $app ($version, signed: $identity)"
