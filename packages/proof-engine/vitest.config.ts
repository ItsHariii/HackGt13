import { defineProject } from "vitest/config";
export default defineProject({
  test: {
    name: "proof-engine",
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
