export default {
  extends: ["@commitlint/config-conventional"],
  // the repository's first commit is the one message outside Conventional Commits
  ignores: [(message) => message.trim() === "Initial commit"],
};
