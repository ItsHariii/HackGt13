import { defineProject } from "vitest/config";
export default defineProject({
  test: {
    name: "evidence-pack",
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
