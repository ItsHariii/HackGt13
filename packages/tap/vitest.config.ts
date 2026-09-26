import { defineProject } from "vitest/config";
export default defineProject({
  test: { name: "tap", environment: "node", include: ["src/**/*.test.ts"] },
});
