#!/bin/sh
# One-time setup for Better Passwords on macOS.
#
# Browsers only let an extension start a native program that a small JSON "host manifest" names.
# macOS ships one for Apple's own extension; this script writes the same kind of file for ours.
# It points at Apple's unmodified helper, so passwords still go through Apple's pairing and
# encryption. It changes nothing else and needs no admin rights.
#
# Usage: setup-mac.sh [--uninstall] [--extension-id ID] [--user-data-dir DIR] [--dry-run]
#   --user-data-dir targets one Chromium profile directory (e.g. a test profile) instead of
#   every installed browser.

set -eu

HOST="io.github.fanckush.betterpasswords.bridge"
HELPER="/System/Cryptexes/App/System/Library/CoreServices/PasswordManagerBrowserExtensionHelper.app/Contents/MacOS/PasswordManagerBrowserExtensionHelper"
CHROMIUM_IDS="ocongmkplhijgajnipnhhggfcjfdilgj"
FIREFOX_ID="better-passwords@fanckush.github.io"
SUPPORT="$HOME/Library/Application Support"

# Chromium-based browsers, as paths of their user data directory under Application Support
BROWSERS="Google/Chrome
Google/Chrome Beta
Google/Chrome Dev
Google/Chrome Canary
Chromium
BraveSoftware/Brave-Browser
BraveSoftware/Brave-Browser-Beta
Microsoft Edge
Vivaldi
Arc/User Data
net.imput.helium"

uninstall=0
user_data_dir=""
dry_run=0
while [ $# -gt 0 ]; do
    case "$1" in
        --uninstall) uninstall=1 ;;
        --dry-run) dry_run=1 ;;
        --extension-id)
            [ $# -ge 2 ] || { echo "--extension-id needs a value" >&2; exit 2; }
            CHROMIUM_IDS="$CHROMIUM_IDS $2"
            shift
            ;;
        --user-data-dir)
            [ $# -ge 2 ] || { echo "--user-data-dir needs a value" >&2; exit 2; }
            user_data_dir="$2"
            shift
            ;;
        -h | --help)
            sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'
            exit 0
            ;;
        *) echo "unknown option: $1" >&2; exit 2 ;;
    esac
    shift
done

if [ "$(uname -s)" != "Darwin" ]; then
    echo "This setup is for macOS only." >&2
    exit 1
fi
if [ "$uninstall" -eq 0 ] && [ ! -x "$HELPER" ]; then
    echo "Apple's password helper was not found. It ships with macOS 14 (Sonoma) or later." >&2
    exit 1
fi

origins=""
for id in $CHROMIUM_IDS; do
    case "$id" in
        *[!a-p]* | "") echo "invalid extension id: $id" >&2; exit 2 ;;
    esac
    origins="$origins${origins:+, }\"chrome-extension://$id/\""
done

# write_manifest DIR KEY VALUE: KEY is allowed_origins (Chromium) or allowed_extensions (Firefox)
write_manifest() {
    file="$1/$HOST.json"
    if [ "$dry_run" -eq 1 ]; then
        echo "would write $file"
        return
    fi
    mkdir -p "$1"
    cat >"$file" <<EOF
{
  "name": "$HOST",
  "description": "Better Passwords: connects the extension to Apple's password helper",
  "path": "$HELPER",
  "type": "stdio",
  "$2": [$3]
}
EOF
    echo "  wrote $file"
}

remove_manifest() {
    file="$1/$HOST.json"
    [ -f "$file" ] || return 0
    if [ "$dry_run" -eq 1 ]; then echo "would remove $file"; else rm -f "$file" && echo "  removed $file"; fi
}

if [ -n "$user_data_dir" ]; then
    dir="$user_data_dir/NativeMessagingHosts"
    if [ "$uninstall" -eq 1 ]; then remove_manifest "$dir"; else write_manifest "$dir" allowed_origins "$origins"; fi
    exit 0
fi

echo "$BROWSERS" | while IFS= read -r browser; do
    [ -d "$SUPPORT/$browser" ] || continue
    dir="$SUPPORT/$browser/NativeMessagingHosts"
    if [ "$uninstall" -eq 1 ]; then remove_manifest "$dir"; else write_manifest "$dir" allowed_origins "$origins"; fi
done
# Firefox and its fork Zen both read manifests from Mozilla's shared folder
if [ -d "$SUPPORT/Firefox" ] || [ -d "$SUPPORT/zen" ]; then
    dir="$SUPPORT/Mozilla/NativeMessagingHosts"
    if [ "$uninstall" -eq 1 ]; then remove_manifest "$dir"; else write_manifest "$dir" allowed_extensions "\"$FIREFOX_ID\""; fi
fi

if [ "$uninstall" -eq 1 ]; then
    echo "Done. Better Passwords can no longer reach Apple's helper."
else
    echo "Done. Click the Better Passwords icon in your browser to pair."
fi
