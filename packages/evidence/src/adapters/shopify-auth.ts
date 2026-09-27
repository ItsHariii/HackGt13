import { type FetchLike, SourceError } from "../http";

/*
 * Shopify agent credentials (shopify.dev/docs/agents/get-started/authentication).
 * A Dev Dashboard client ID and secret are exchanged for a bearer token with
 * the client-credentials grant; the token lasts 60 minutes. This keeps one
 * token per process and renews it five minutes before it expires, sharing a
 * single in-flight request between concurrent callers. The secret and the
 * token only ever travel in request bodies and headers, never in snapshots.
 */

const LABEL = "Shopify auth";
export const SHOPIFY_TOKEN_URL = "https://api.shopify.com/auth/access_token";
const DEFAULT_TTL_S = 3_600;
const RENEW_EARLY_MS = 5 * 60_000;

/** Returns a current bearer token. */
export type ShopifyToken = () => Promise<string>;

export type ShopifyTokenOptions = {
  clientId: string;
  clientSecret: string;
  fetch?: FetchLike;
  now?: () => number;
  url?: string;
};

export function createShopifyTokenSource(
  opts: ShopifyTokenOptions,
): ShopifyToken {
  if (!opts.clientId.trim() || !opts.clientSecret.trim())
    throw new SourceError(
      LABEL,
      "not_configured",
      "SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET are required",
    );
  const now = opts.now ?? Date.now;
  const f = opts.fetch ?? fetch;
  let cached: { token: string; renewAt: number } | null = null;
  let inflight: Promise<string> | null = null;

  async function fetchToken(): Promise<string> {
    const res = await f(opts.url ?? SHOPIFY_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        client_id: opts.clientId,
        client_secret: opts.clientSecret,
        grant_type: "client_credentials",
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok)
      throw new SourceError(
        LABEL,
        "http",
        `token request failed: HTTP ${res.status}`,
        res.status,
      );
    const body = (await res.json().catch(() => null)) as {
      access_token?: unknown;
      expires_in?: unknown;
    } | null;
    const token = body?.access_token;
    if (typeof token !== "string" || token.length === 0)
      throw new SourceError(LABEL, "invalid_response", "no access_token");
    const ttl =
      typeof body?.expires_in === "number" && body.expires_in > 0
        ? body.expires_in
        : DEFAULT_TTL_S;
    cached = {
      token,
      renewAt: now() + Math.max(ttl * 1000 - RENEW_EARLY_MS, 30_000),
    };
    return token;
  }

  return async () => {
    if (cached && now() < cached.renewAt) return cached.token;
    inflight ??= fetchToken().finally(() => {
      inflight = null;
    });
    return inflight;
  };
}
