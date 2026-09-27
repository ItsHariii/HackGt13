import "server-only";
import { type AiRunner, createRouter, readAiConfig } from "@cartel/ai";
import { supabaseAiSink } from "@cartel/ai/supabase";
import { logger } from "./logger";
import { createAdminClient } from "./supabase/admin";

/*
 * The one AI router for this server (SDD §10). The config is read once per
 * instance so the circuit breaker's state carries across requests; every
 * call is logged to `ai_calls` with the secret key. `AI_ENABLED=false`, no
 * key, or an open breaker all surface as errors each caller maps to its
 * manual path.
 */

let router: AiRunner | null = null;

export function aiRouter(): AiRunner {
  if (router) return router;
  const config = readAiConfig();
  const canLog =
    !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.SUPABASE_SECRET_KEY;
  router = createRouter({
    config,
    ...(canLog ? { sink: supabaseAiSink(createAdminClient()) } : {}),
    onLogError: (error) => logger.warn({ err: error }, "ai_calls log failed"),
  });
  return router;
}
