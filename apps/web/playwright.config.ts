import { defineConfig, devices } from "@playwright/test";
import { e2eEnv, GREATHUB_PORT, WEB, WEB_PORT } from "./e2e/env";

/*
 * End-to-end suite (TASKS T16.6): `pnpm --filter @cartel/web e2e` with the
 * local Supabase running. Starts GreatHub and Cartel on their own ports so
 * a dev server on 3000/3001 keeps running.
 */
const env = e2eEnv();

export default defineConfig({
  testDir: "./e2e",
  timeout: 240_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: WEB,
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
  webServer: [
    {
      command: `node_modules/.bin/next dev --port ${GREATHUB_PORT}`,
      cwd: "../greathub",
      url: `http://localhost:${GREATHUB_PORT}/`,
      env,
      timeout: 180_000,
      reuseExistingServer: false,
    },
    {
      command: `node_modules/.bin/next dev --port ${WEB_PORT}`,
      cwd: ".",
      url: `${WEB}/.well-known/jwks.json`,
      env,
      timeout: 180_000,
      reuseExistingServer: false,
    },
  ],
});
