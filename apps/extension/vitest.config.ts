import { defineProject } from "vitest/config";

export default defineProject({
  test: { name: "extension", environment: "happy-dom", include: ["test/**/*.test.ts"] },
});
