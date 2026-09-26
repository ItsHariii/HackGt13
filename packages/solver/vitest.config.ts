import { defineProject } from "vitest/config";
export default defineProject({
  test: { name: "solver", environment: "node", include: ["src/**/*.test.ts"] },
});
