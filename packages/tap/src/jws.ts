// Compact JWS with EdDSA (Ed25519), RFC 7515 + RFC 8037. Used for scoped
// payment grants; the verifier only accepts `alg: EdDSA` (no `none`, no HMAC).

import { fromBase64Url, fromUtf8, toBase64Url, utf8 } from "./base64";
import { type Ed25519PublicKey, edSign, edVerify } from "./ed25519";
import type { SigningKey } from "./keys";

export interface JwsHeader {
  alg: "EdDSA";
  kid: string;
  typ?: string;
}

export async function signJws(
  payload: unknown,
  key: SigningKey,
  typ?: string,
): Promise<string> {
  const header: JwsHeader = {
    alg: "EdDSA",
    kid: key.keyId,
    ...(typ ? { typ } : {}),
  };
  const input = `${toBase64Url(utf8(JSON.stringify(header)))}.${toBase64Url(
    utf8(JSON.stringify(payload)),
  )}`;
  const sig = await edSign(key.privateKey, utf8(input));
  return `${input}.${toBase64Url(sig)}`;
}

export type JwsFailure =
  | "malformed"
  | "unsupported_alg"
  | "wrong_type"
  | "unknown_key"
  | "bad_signature";

export type JwsResult =
  | { ok: true; header: JwsHeader; payload: unknown }
  | { ok: false; reason: JwsFailure; kid?: string };

/** Verify signature and header only; the caller validates the claims. */
export async function verifyJws(
  jws: string,
  resolveKey: (kid: string) => Promise<Ed25519PublicKey | null>,
  expectedTyp?: string,
): Promise<JwsResult> {
  const parts = jws.split(".");
  if (parts.length !== 3) return { ok: false, reason: "malformed" };
  const [h, p, s] = parts as [string, string, string];
  let header: Partial<JwsHeader> & { crit?: unknown };
  let payload: unknown;
  let signature: Uint8Array;
  try {
    header = JSON.parse(fromUtf8(fromBase64Url(h)));
    payload = JSON.parse(fromUtf8(fromBase64Url(p)));
    signature = fromBase64Url(s);
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (header.alg !== "EdDSA" || header.crit !== undefined) {
    return { ok: false, reason: "unsupported_alg" };
  }
  if (typeof header.kid !== "string") return { ok: false, reason: "malformed" };
  const kid = header.kid;
  if (expectedTyp !== undefined && header.typ !== expectedTyp) {
    return { ok: false, reason: "wrong_type", kid };
  }
  const key = await resolveKey(kid);
  if (!key) return { ok: false, reason: "unknown_key", kid };
  const valid = await edVerify(key, signature, utf8(`${h}.${p}`));
  if (!valid) return { ok: false, reason: "bad_signature", kid };
  return { ok: true, header: header as JwsHeader, payload };
}
