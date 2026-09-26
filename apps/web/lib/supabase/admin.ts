import "server-only";
import type { Database } from "@proofcart/contracts/db";
import { requireEnv } from "@proofcart/platform/env";
import { createClient } from "@supabase/supabase-js";
export function createAdminClient(signal?: AbortSignal) {
  return createClient<Database>(
    requireEnv(
      "NEXT_PUBLIC_SUPABASE_URL",
      process.env.NEXT_PUBLIC_SUPABASE_URL,
    ),
    requireEnv("SUPABASE_SECRET_KEY", process.env.SUPABASE_SECRET_KEY),
    {
      ...(signal
        ? {
            global: {
              fetch: (input: RequestInfo | URL, init?: RequestInit) =>
                fetch(input, {
                  ...init,
                  signal: AbortSignal.any([
                    signal,
                    ...(init?.signal ? [init.signal] : []),
                  ]),
                  cache: "no-store",
                }),
            },
          }
        : {}),
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
}
