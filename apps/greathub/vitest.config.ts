import { defineProject } from "vitest/config";
export default defineProject({
  test: {
    name: "greathub",
    environment: "node",
    include: ["lib/**/*.test.ts"],
  },
});
