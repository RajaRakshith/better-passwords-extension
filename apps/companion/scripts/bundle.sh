#!/bin/sh
# Builds "Better Passwords.app" into apps/companion/dist.
#
# Usage: scripts/bundle.sh [--version X.Y.Z] [--sign identity-or-SHA1]
#
# By default, use a valid Apple Development identity from the sole team in the user's keychain.
# Select by SHA-1 fingerprint so duplicate certificate names are never ambiguous.
# Without --version it is a development build, which never updates itself.

set -eu
cd "$(dirname "$0")/.."

version="0.0.0"
identity=""
identity_label=""
identity_was_set=false
while [ $# -gt 0 ]; do
    case "$1" in
        --version) version="$2"; shift ;;
        --sign) identity="$2"; identity_label="$2"; identity_was_set=true; shift ;;
        -h | --help) sed -n '2,8p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
        *) echo "unknown option: $1" >&2; exit 2 ;;
    esac
    shift
done

if [ "$identity_was_set" = false ]; then
    identities="$(security find-identity -v -p codesigning | awk -F '"' '/"Apple Development:/ { hash = $1; sub(/^.*\) /, "", hash); gsub(/[[:space:]]/, "", hash); print hash "\t" $2 }')"
    count="$(printf '%s\n' "$identities" | awk 'NF { count++ } END { print count + 0 }')"
    if [ "$count" -eq 0 ]; then
        cat >&2 <<'EOF'
No valid Apple Development signing identity was found in your keychain.
In Xcode, open Settings > Accounts, select your team, choose Manage Certificates,
then create an Apple Development certificate. Its private key must be present too.
Check with: security find-identity -v -p codesigning
EOF
        exit 1
    fi
    teams="$(printf '%s\n' "$identities" | awk -F '\t' '{ team = $2; sub(/^.*\(/, "", team); sub(/\).*$/, "", team); print team }' | sort -u)"
    team_count="$(printf '%s\n' "$teams" | awk 'NF { count++ } END { print count + 0 }')"
    if [ "$team_count" -ne 1 ]; then
        cat >&2 <<EOF
Found Apple Development identities from multiple teams. Choose one by its SHA-1 fingerprint:
$(printf '%s\n' "$identities" | sort | awk -F '\t' '{ printf "%s  %s\n", $1, $2 }')
Run scripts/bundle.sh --sign SHA1-FINGERPRINT.
EOF
        exit 1
    fi
    selected="$(printf '%s\n' "$identities" | sort | head -n 1)"
    identity="$(printf '%s\n' "$selected" | cut -f 1)"
    identity_label="$(printf '%s\n' "$selected" | cut -f 2)"
fi

if [ "$identity" = "-" ]; then
    echo "Ad-hoc signing is disabled; use a valid Apple Development identity." >&2
    exit 2
fi

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

set -- --force --sign "$identity" --options runtime --timestamp

# Inside out: Sparkle's helpers, then its framework.
codesign "$@" "$sparkle/Versions/B/Autoupdate"
codesign "$@" "$sparkle/Versions/B/Updater.app"
codesign "$@" "$sparkle"

# Sign the host before the app so both are trusted through the same signing team.
codesign "$@" --identifier io.github.fanckush.betterpasswords.companion.host "$host"
codesign "$@" --entitlements Resources/BetterPasswords.entitlements "$app"
codesign --verify --strict --deep "$app"

echo "built $app ($version, signed: $identity_label; fingerprint: $identity)"
