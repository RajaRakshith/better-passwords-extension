#!/bin/sh
# Reproduce the Firefox extension from a clean source archive. No native setup or signing.
set -eu

review_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$review_root"

command -v node >/dev/null 2>&1 || { echo "Install Node.js 22.15.0; see README.md." >&2; exit 1; }
command -v bun >/dev/null 2>&1 || { echo "Install Bun 1.4.4; see README.md." >&2; exit 1; }
[ "$(node --version)" = "v22.15.0" ] || { echo "Reproduction requires Node.js 22.15.0." >&2; exit 1; }
[ "$(bun --version)" = "1.4.4" ] || { echo "Reproduction requires Bun 1.4.4." >&2; exit 1; }

# Keep the submitted dependency versions and suppress lifecycle scripts/git-hook installation.
bun install --frozen-lockfile --ignore-scripts
bun run --filter @app/extension build:firefox
echo "Rebuilt Firefox files: apps/extension/.output/firefox-mv2"
