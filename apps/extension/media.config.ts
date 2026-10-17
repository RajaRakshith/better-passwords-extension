import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "media",
  testMatch: ["capture.spec.ts", "promo.spec.ts"],
  timeout: 120_000,
  workers: 1,
  retries: 0,
  reporter: "list",
  outputDir: ".output/media-test-results",
});
