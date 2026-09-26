import "server-only";
import { JwksCache, type TapTag, verifyRequest } from "@proofcart/tap";
import { keyRoles, merchantOrigin, proofcartJwksUrl } from "./config";
import { logger } from "./logger";
import { db } from "./supabase/admin";

// One JWKS cache per server instance: 5-minute TTL, refetch on an unknown kid.
const caches = new Map<string, JwksCache>();
export function proofcartKeys(): JwksCache | null {
  const url = proofcartJwksUrl();
  if (!url) return null;
  let cache = caches.get(url);
  if (!cache) {
    cache = new JwksCache(url);
    caches.set(url, cache);
  }
  return cache;
}

export interface AgentIdentity {
  keyId: string;
  tag: string | null;
  requestId: string;
}

export type AgentAuth =
  | { ok: true; agent: AgentIdentity }
  | { ok: false; response: Response };

const MESSAGES: Record<string, string> = {
  missing_signature: "This endpoint requires an RFC 9421 agent signature.",
  malformed_signature: "Signature-Input or Signature could not be parsed.",
  unsupported_alg: "Only ed25519 signatures are accepted.",
  missing_created: "The signature has no created time.",
  missing_expires: "The signature has no expiry.",
  not_yet_valid: "The signature was created in the future.",
  expired: "The signature has expired.",
  window_too_long: "The signature is valid for longer than 8 minutes.",
  missing_nonce: "The signature has no nonce.",
  missing_keyid: "The signature has no key ID.",
  wrong_tag: "The signature's tag does not allow this operation.",
  missing_component: "The signature does not cover a required component.",
  missing_digest: "Content-Digest is missing.",
  digest_mismatch: "Content-Digest does not match the body.",
  unknown_key: "The key ID is not in the agent's JWKS.",
  bad_signature: "The signature does not verify.",
  nonce_replayed: "This nonce was already used.",
  jwks_unavailable: "The agent's JWKS could not be fetched.",
  not_configured: "Agent verification is not configured on this merchant.",
};

export function requestIdOf(request: Request): string {
  const id =
    request.headers.get("request-id") ?? request.headers.get("x-request-id");
  return id && /^[\w.:-]{1,128}$/.test(id) ? id : crypto.randomUUID();
}

async function logAttempt(entry: {
  request: Request;
  requestId: string;
  keyId: string | null;
  tag: string | null;
  verdict: "accepted" | "rejected";
  reason: string | null;
}) {
  const url = new URL(entry.request.url);
  const { error } = await db().from("agent_log").insert({
    request_id: entry.requestId,
    method: entry.request.method,
    path: url.pathname,
    key_id: entry.keyId,
    tag: entry.tag,
    verdict: entry.verdict,
    reason: entry.reason,
  });
  if (error)
    logger.error(
      { err: error.message, requestId: entry.requestId },
      "agent_log insert failed",
    );
}

/**
 * Verify a TAP-style agent signature (SDD §13.3): RFC 9421 over @method,
 * @authority, @path and content-digest; ≤ 8 min window; single-use nonce; key
 * from ProofCart's JWKS. Every attempt is written to the Agent Log.
 */
export async function authenticateAgent(
  request: Request,
  body: string,
  allowedTags: readonly TapTag[],
): Promise<AgentAuth> {
  const requestId = requestIdOf(request);
  const reject = async (
    reason: string,
    status: number,
    keyId: string | null,
    tag: string | null,
  ) => {
    await logAttempt({
      request,
      requestId,
      keyId,
      tag,
      verdict: "rejected",
      reason,
    });
    return {
      ok: false as const,
      response: Response.json(
        {
          type: "unauthorized",
          code: reason,
          message: MESSAGES[reason] ?? reason,
        },
        {
          status,
          headers: {
            "Request-Id": requestId,
            "Cache-Control": "no-store",
            "Accept-Signature": `sig1=("@method" "@authority" "@path" "content-digest");keyid;alg="ed25519";tag="${allowedTags[0]}"`,
          },
        },
      ),
    };
  };

  const keys = proofcartKeys();
  if (!keys) return reject("not_configured", 503, null, null);

  // Verify against the public origin agents sign for, not whatever Host reached us.
  const incoming = new URL(request.url);
  const url = new URL(
    `${incoming.pathname}${incoming.search}`,
    merchantOrigin(request),
  );
  let jwksDown = false;
  const result = await verifyRequest(
    { method: request.method, url, headers: request.headers },
    {
      body,
      allowedTags,
      resolveKey: async (kid) => {
        if (!kid.startsWith(keyRoles().agent)) return null;
        try {
          return await keys.getKey(kid);
        } catch (e) {
          jwksDown = true;
          logger.error({ err: (e as Error).message }, "JWKS fetch failed");
          return null;
        }
      },
    },
  );
  if (!result.ok) {
    const reason = jwksDown ? "jwks_unavailable" : result.reason;
    return reject(
      reason,
      jwksDown ? 503 : 401,
      result.keyId ?? null,
      result.tag ?? null,
    );
  }
  const { keyId, tag, nonce } = result.signature;
  const { data: fresh, error } = await db().rpc("record_nonce", {
    p_key_id: keyId,
    p_nonce: nonce ?? "",
  });
  if (error) {
    logger.error({ err: error.message, requestId }, "nonce check failed");
    return reject("nonce_check_failed", 503, keyId, tag);
  }
  if (!fresh) return reject("nonce_replayed", 401, keyId, tag);
  await logAttempt({
    request,
    requestId,
    keyId,
    tag,
    verdict: "accepted",
    reason: null,
  });
  return { ok: true, agent: { keyId, tag, requestId } };
}
