import { defineProject } from "vitest/config";
export default defineProject({
  test: {
    name: "demomart",
    environment: "node",
    include: ["lib/**/*.test.ts"],
  },
});
