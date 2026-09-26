import { defineConfig } from "vitest/config";

// Not named vitest.config.ts on purpose: the root `pnpm test` projects glob must not pick these up,
// because they need a running local Supabase (`pnpm db:start`). Run with `pnpm db:test:integration`.
export default defineConfig({
  test: {
    name: "db",
    environment: "node",
    include: ["src/**/*.db.test.ts"],
    testTimeout: 20_000,
    hookTimeout: 30_000,
    // Tests share one database; keep files sequential so fixtures never race.
    fileParallelism: false,
  },
});
