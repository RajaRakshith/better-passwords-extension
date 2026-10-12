import { defineProject } from "vitest/config";

export default defineProject({
  test: { name: "protocol", testTimeout: 30_000 },
});
