// Scoped payment grants (SDD §13.2, T13.4): a short-lived EdDSA JWS that lets
// exactly one merchant charge at most the contract's maximum, once.

import { GRANT_MAX_LIFETIME_S, ScopedPaymentGrant } from "@proofcart/contracts";
import {
  type Ed25519PublicKey,
  type SigningKey,
  signJws,
  verifyJws,
} from "@proofcart/tap";

export const GRANT_JWS_TYPE = "proofcart-grant+jwt";

export type GrantClaimsInput = Omit<
  ScopedPaymentGrant,
  "iat" | "exp" | "jti"
> & {
  jti?: string;
};

export async function mintGrant(
  input: GrantClaimsInput,
  key: SigningKey,
  opts: { now?: number; ttlSeconds?: number } = {},
): Promise<{ jws: string; claims: ScopedPaymentGrant }> {
  const iat = opts.now ?? Math.floor(Date.now() / 1000);
  const ttl = Math.min(
    opts.ttlSeconds ?? GRANT_MAX_LIFETIME_S,
    GRANT_MAX_LIFETIME_S,
  );
  const claims = ScopedPaymentGrant.parse({
    ...input,
    jti: input.jti ?? `grant_${crypto.randomUUID()}`,
    iat,
    exp: iat + ttl,
  });
  return { jws: await signJws(claims, key, GRANT_JWS_TYPE), claims };
}

export type GrantFailure =
  | "malformed"
  | "unsupported_alg"
  | "wrong_type"
  | "unknown_key"
  | "bad_signature"
  | "invalid_claims"
  | "not_yet_valid"
  | "expired"
  | "wrong_audience"
  | "wrong_merchant"
  | "currency_mismatch"
  | "amount_exceeds_grant"
  | "contract_mismatch";

export type GrantCheck =
  | { ok: true; grant: ScopedPaymentGrant }
  | { ok: false; reason: GrantFailure; detail?: string };

export interface GrantExpectations {
  resolveKey: (kid: string) => Promise<Ed25519PublicKey | null>;
  /** The merchant's own origin; must equal `aud`. */
  audience: string;
  merchantId: string;
  amountMinor: number;
  currency: string;
  /** When known, `contractHash` must equal it. */
  contractHash?: string;
  now?: number;
  skewSeconds?: number;
}

function origin(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/** Verify signature, lifetime and scope. The caller enforces single use of `jti`. */
export async function verifyGrant(
  jws: string,
  expect: GrantExpectations,
): Promise<GrantCheck> {
  const result = await verifyJws(jws, expect.resolveKey, GRANT_JWS_TYPE);
  if (!result.ok) return { ok: false, reason: result.reason };
  const parsed = ScopedPaymentGrant.safeParse(result.payload);
  if (!parsed.success) {
    return {
      ok: false,
      reason: "invalid_claims",
      detail: parsed.error.issues
        .map((i) => i.path.join(".") || i.message)
        .join(", "),
    };
  }
  const grant = parsed.data;
  const now = expect.now ?? Math.floor(Date.now() / 1000);
  const skew = expect.skewSeconds ?? 30;
  if (grant.iat > now + skew) return { ok: false, reason: "not_yet_valid" };
  if (grant.exp <= now) return { ok: false, reason: "expired" };
  if (
    origin(grant.aud) === null ||
    origin(grant.aud) !== origin(expect.audience)
  ) {
    return { ok: false, reason: "wrong_audience", detail: grant.aud };
  }
  if (grant.merchantId !== expect.merchantId)
    return { ok: false, reason: "wrong_merchant" };
  if (grant.currency !== expect.currency)
    return { ok: false, reason: "currency_mismatch" };
  if (expect.amountMinor > grant.maxTotalMinor) {
    return {
      ok: false,
      reason: "amount_exceeds_grant",
      detail: `${expect.amountMinor} > ${grant.maxTotalMinor}`,
    };
  }
  if (
    expect.contractHash !== undefined &&
    grant.contractHash !== expect.contractHash
  ) {
    return { ok: false, reason: "contract_mismatch" };
  }
  return { ok: true, grant };
}
