import { defineProject } from "vitest/config";
export default defineProject({
  test: {
    name: "rule-packs",
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
