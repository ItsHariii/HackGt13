import { defineProject } from "vitest/config";
export default defineProject({
  test: {
    name: "evidence",
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
