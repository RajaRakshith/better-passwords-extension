# Contributing

Thanks for helping! This page gets you from clone to a tested change.

## Setup

You need [Bun](https://bun.sh) 1.3 or later. A Mac is only needed for live testing against Apple's helper; everything else runs anywhere.

```sh
bun install          # also installs the git hooks (lefthook)
bun run check        # lint + typecheck + unit tests
bun run build        # store + GitHub + Firefox builds into apps/extension/.output
bun run test:e2e     # Playwright: real Chromium + the fake helper (run `bunx playwright install chromium` once)
```

## Repository layout

| Path | Contents |
|---|---|
| `apps/extension` | The WXT extension: `entrypoints/` (background, popup), `src/` (session, fill, config) |
| `packages/protocol` | The helper protocol: SRP pairing, encrypted channel, queries |
| `packages/fake-helper` | Test double of Apple's helper |
| `scripts/setup-mac.sh` | One-time setup for the store build |
| `docs/` | Architecture, protocol, threat model, releasing |

The UI uses no framework: plain TypeScript and DOM via the small `h()` helper in `apps/extension/src/ui/h.ts`. Please keep it that way.

## Trying a change against the real helper

Use a throwaway browser profile, so your everyday profile and Apple's extension stay untouched:

```sh
bun run build
PROFILE=$(mktemp -d)
scripts/setup-mac.sh --user-data-dir "$PROFILE"     # store build only
open -na "Google Chrome" --args --user-data-dir="$PROFILE" \
  --load-extension="$PWD/apps/extension/.output/store-chrome-mv3"
```

Chrome 137+ ignores `--load-extension`. Either load the folder from `chrome://extensions` (Developer mode → Load unpacked), or use Chromium, Helium or another Chromium build.

**Never** paste real passwords, pairing codes, or screenshots showing them into issues, PRs or logs.

## Commits and pull requests

- Commits follow [Conventional Commits](https://www.conventionalcommits.org) (`feat:`, `fix:`, `docs:`, …). A git hook checks this, and the type decides the next release (see [docs/release.md](docs/release.md)).
- Keep PRs focused, and add tests for behavior changes. Protocol changes need unit tests. Fill logic needs DOM tests.
- Changes to pairing, encryption, filling or the setup script get extra review. Say so in the PR description.

By contributing, you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md) and license your work under the [MIT License](LICENSE).
