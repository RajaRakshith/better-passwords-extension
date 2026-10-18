import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      "packages/*",
      "apps/extension",
      { test: { name: "scripts", include: ["scripts/**/*.test.ts"], environment: "node" } },
    ],
    coverage: {
      provider: "v8",
      // unit coverage only: the entrypoints are wiring, exercised by the e2e suite instead
      include: ["apps/extension/src/**/*.ts", "packages/protocol/src/**/*.ts", "scripts/**/*.ts"],
      exclude: ["**/*.test.ts", "**/*.d.ts"],
      reporter: ["text-summary", "html", "json-summary"],
    },
  },
});
