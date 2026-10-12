// Releases the extension from conventional commits on main. Every feat/fix in the repo counts,
// since the extension bundles the shared packages. When the companion app gets its own releases,
// filter by path here.
// The version lives in the git tag; package.json is bumped only inside the CI checkout.
export default {
  branches: ["main"],
  tagFormat: "extension-v${version}",
  plugins: [
    ["@semantic-release/commit-analyzer", { preset: "conventionalcommits" }],
    ["@semantic-release/release-notes-generator", { preset: "conventionalcommits" }],
    [
      "@semantic-release/exec",
      {
        prepareCmd: "npm pkg set version=${nextRelease.version} && bun run zip:all",
        successCmd: 'echo "version=${nextRelease.version}" >> "$GITHUB_OUTPUT"',
      },
    ],
    ["@semantic-release/github", { assets: [{ path: ".output/*.zip" }] }],
  ],
};
