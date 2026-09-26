import "server-only";
import { requireEnv } from "@cartel/platform/env";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./db";

export type GreatHubDb = SupabaseClient<Database, "greathub">;

/** Secret-key client scoped to the `greathub` schema. Server only. */
export function createAdminClient(): GreatHubDb {
  return createClient<Database, "greathub">(
    requireEnv(
      "NEXT_PUBLIC_SUPABASE_URL",
      process.env.NEXT_PUBLIC_SUPABASE_URL,
    ),
    requireEnv("SUPABASE_SECRET_KEY", process.env.SUPABASE_SECRET_KEY),
    {
      db: { schema: "greathub" },
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

let shared: GreatHubDb | null = null;

/** One client per server instance; it holds no per-request state. */
export function db(): GreatHubDb {
  shared ??= createAdminClient();
  return shared;
}
