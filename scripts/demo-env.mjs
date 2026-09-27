// Shared setup for `pnpm demo:reset` and `pnpm demo:check` (TASKS T18.1, T18.2).
//
// Values set in the shell win; after that, `.env.demo` at the repo root, then each app's
// `.env.local`. Point `.env.demo` at production before the demo:
//
//   CARTEL_URL=https://cartel.<domain>
//   GREATHUB_URL=https://greathub.<domain>
//   NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
//   SUPABASE_SECRET_KEY=sb_secret_...
//   CHAOS_ADMIN_TOKEN=...
//   DEMO_USER_EMAIL=demo@...            (or DEMO_USER_ID=<auth.users id>)
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(root, "apps/web/package.json"));

export function loadDemoEnv() {
  const loaded = [];
  for (const rel of [
    ".env.demo",
    "apps/web/.env.local",
    "apps/greathub/.env.local",
  ]) {
    const file = join(root, rel);
    if (!existsSync(file)) continue;
    process.loadEnvFile(file);
    loaded.push(rel);
  }
  const env = process.env;
  const cartel = env.CARTEL_URL ?? env.WEBAUTHN_ORIGIN ?? env.CARTEL_BASE_URL;
  const greathub =
    env.GREATHUB_URL ?? env.GREATHUB_BASE_URL ?? env.GREATHUB_PUBLIC_ORIGIN;
  return {
    loaded,
    cartel: cartel?.replace(/\/$/, ""),
    greathub: greathub?.replace(/\/$/, ""),
    supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL,
    secretKey: env.SUPABASE_SECRET_KEY,
    chaosToken: env.CHAOS_ADMIN_TOKEN,
    demoUserId: env.DEMO_USER_ID,
    demoUserEmail: env.DEMO_USER_EMAIL,
  };
}

export function adminClient(url, key) {
  const { createClient } = require("@supabase/supabase-js");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** The demo user's auth ID, from DEMO_USER_ID or by looking up DEMO_USER_EMAIL. */
export async function demoUser(db, config) {
  if (config.demoUserId) return config.demoUserId;
  if (!config.demoUserEmail) return null;
  const email = config.demoUserEmail.toLowerCase();
  for (let page = 1; page < 50; page++) {
    const { data, error } = await db.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) throw new Error(`listUsers: ${error.message}`);
    const hit = data.users.find((u) => u.email?.toLowerCase() === email);
    if (hit) return hit.id;
    if (data.users.length < 200) return null;
  }
  return null;
}

export const SEARCH_QUERY = "navy linen shirt";

/** Reads the `/api/search` NDJSON stream to the end: one chunk per source. */
export async function search(cartel, query = SEARCH_QUERY) {
  const url = `${cartel}/api/search?q=${encodeURIComponent(query)}&limit=20`;
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  return text
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));
}

export function reporter() {
  let failed = 0;
  const line = (mark, what, detail = "") => {
    if (mark === "✗") failed++;
    console.log(`${mark} ${what.padEnd(34)} ${detail}`.trimEnd());
  };
  return {
    ok: (what, detail) => line("✓", what, detail),
    fail: (what, detail) => line("✗", what, detail),
    skip: (what, detail) => line("-", what, detail),
    warn: (what, detail) => line("!", what, detail),
    get failed() {
      return failed;
    },
  };
}

export function message(error) {
  return error instanceof Error ? error.message : String(error);
}
