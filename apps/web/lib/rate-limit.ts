import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { logger } from "./logger";
import { createAdminClient } from "./supabase/admin";
import { createClient } from "./supabase/server";

/*
 * Per-user rate limits on expensive endpoints (SDD §20.1, TASKS T17.2),
 * backed by the Postgres token bucket `srv_take_rate_token`. Signed-in
 * callers are limited by user, everyone else by a hash of their IP.
 */

export const RATE_LIMITS = {
  /** One /bench "Run live" spends a token per case: a few full runs, then one every ~10 s. */
  bench_run: { capacity: 30, refillPerS: 0.5 },
  /** Search fans out to live sources, each with its own published limits. */
  search: { capacity: 30, refillPerS: 0.5 },
  /** AI endpoints (A1–A5): model spend. */
  ai: { capacity: 10, refillPerS: 1 / 6 },
  /** Solving reads every candidate page and quotes three GreatHub checkouts. */
  solve: { capacity: 6, refillPerS: 1 / 20 },
} as const satisfies Record<string, { capacity: number; refillPerS: number }>;

export type RateBucket = keyof typeof RATE_LIMITS;
export type RateDecision =
  | { allowed: true }
  | { allowed: false; retryAfterMs: number };

type TakeToken = (args: {
  p_bucket: string;
  p_subject: string;
  p_capacity: number;
  p_refill_per_s: number;
  p_cost: number;
}) => PromiseLike<{
  data: { allowed: boolean; retry_after_ms: number }[] | null;
  error: { message: string } | null;
}>;

/** `user:<id>`, or `ip:<hash>` so raw addresses never reach the database. */
export function rateSubject(user: string | null, h: Headers): string {
  if (user) return `user:${user}`;
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip")?.trim() ||
    "unknown";
  return `ip:${createHash("sha256").update(ip).digest("hex").slice(0, 32)}`;
}

function adminTake(): TakeToken | null {
  try {
    const db = createAdminClient();
    return (args) => db.rpc("srv_take_rate_token", args);
  } catch {
    return null;
  }
}

/**
 * Spends `cost` tokens. Fails open when the database is missing or erroring:
 * the limit protects spend, and an outage should not also take search down.
 */
export async function takeRateToken(
  bucket: RateBucket,
  subject: string,
  cost = 1,
  take: TakeToken | null = adminTake(),
): Promise<RateDecision> {
  if (!take) return { allowed: true };
  const limit = RATE_LIMITS[bucket];
  const { data, error } = await take({
    p_bucket: bucket,
    p_subject: subject,
    p_capacity: limit.capacity,
    p_refill_per_s: limit.refillPerS,
    p_cost: cost,
  });
  const row = data?.[0];
  if (error || !row) {
    logger.warn({ bucket, err: error?.message }, "rate limit unavailable");
    return { allowed: true };
  }
  return row.allowed
    ? { allowed: true }
    : { allowed: false, retryAfterMs: row.retry_after_ms };
}

/** Limits the current request by its signed-in user, else its client IP. */
export async function limitCurrentRequest(
  bucket: RateBucket,
  cost = 1,
): Promise<RateDecision> {
  const client = await createClient();
  const claims = client ? (await client.auth.getClaims()).data?.claims : null;
  const user = typeof claims?.sub === "string" ? claims.sub : null;
  return takeRateToken(bucket, rateSubject(user, await headers()), cost);
}

export function tooManyRequests(retryAfterMs: number) {
  return Response.json(
    { error: "rate_limited", retryAfterMs },
    {
      status: 429,
      headers: {
        "Cache-Control": "no-store",
        "Retry-After": String(Math.max(1, Math.ceil(retryAfterMs / 1000))),
      },
    },
  );
}
