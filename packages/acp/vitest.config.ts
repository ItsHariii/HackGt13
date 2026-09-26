import { defineProject } from "vitest/config";
export default defineProject({
  test: { name: "acp", environment: "node", include: ["src/**/*.test.ts"] },
});
