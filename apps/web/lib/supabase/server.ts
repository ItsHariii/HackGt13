import "server-only";
import type { Database } from "@cartel/contracts/db";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseConfig } from "./config";
export async function createClient() {
  const config = getSupabaseConfig();
  if (!config) return null;
  const store = await cookies();
  return createServerClient<Database>(config.url, config.key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet)
            store.set(name, value, options);
        } catch {
          /* Server Components cannot write cookies; proxy handles refresh. */
        }
      },
    },
  });
}
