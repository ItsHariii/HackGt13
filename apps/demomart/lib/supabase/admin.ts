import "server-only";
import { requireEnv } from "@proofcart/platform/env";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./db";

export type DemoMartDb = SupabaseClient<Database, "demomart">;

/** Secret-key client scoped to the `demomart` schema. Server only. */
export function createAdminClient(): DemoMartDb {
  return createClient<Database, "demomart">(
    requireEnv(
      "NEXT_PUBLIC_SUPABASE_URL",
      process.env.NEXT_PUBLIC_SUPABASE_URL,
    ),
    requireEnv("SUPABASE_SECRET_KEY", process.env.SUPABASE_SECRET_KEY),
    {
      db: { schema: "demomart" },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
      },
    },
  );
}

let shared: DemoMartDb | null = null;

/** One client per server instance; it holds no per-request state. */
export function db(): DemoMartDb {
  shared ??= createAdminClient();
  return shared;
}
