// Ed25519 keys as JWKs (RFC 8037), through Web Crypto or the @noble/curves
// fallback, whichever this runtime supports.

import { fromBase64Url, toBase64Url } from "./base64";
import {
  type Ed25519PrivateKey,
  type Ed25519PublicKey,
  ed25519Backend,
  nobleKey,
  noblePublicKeyOf,
  nobleRandomPrivateKey,
} from "./ed25519";

export interface Ed25519PublicJwk {
  kty: "OKP";
  crv: "Ed25519";
  x: string;
  kid?: string;
  use?: string;
  alg?: string;
}
export interface Ed25519PrivateJwk extends Ed25519PublicJwk {
  d: string;
}

export interface SigningKey {
  keyId: string;
  privateKey: Ed25519PrivateKey;
}

const ED25519 = { name: "Ed25519" } as const;

export function isEd25519PublicJwk(value: unknown): value is Ed25519PublicJwk {
  const v = value as Partial<Ed25519PublicJwk> | null;
  return (
    typeof v === "object" &&
    v !== null &&
    v.kty === "OKP" &&
    v.crv === "Ed25519" &&
    typeof v.x === "string" &&
    /^[A-Za-z0-9_-]{43}$/.test(v.x)
  );
}

export async function importPublicJwk(
  jwk: Ed25519PublicJwk,
): Promise<Ed25519PublicKey> {
  if ((await ed25519Backend()) === "noble") {
    return nobleKey("public", fromBase64Url(jwk.x));
  }
  return crypto.subtle.importKey(
    "jwk",
    { kty: "OKP", crv: "Ed25519", x: jwk.x },
    ED25519,
    true,
    ["verify"],
  );
}

export async function importPrivateJwk(
  jwk: Ed25519PrivateJwk,
): Promise<Ed25519PrivateKey> {
  if ((await ed25519Backend()) === "noble") {
    return nobleKey("private", fromBase64Url(jwk.d));
  }
  return crypto.subtle.importKey(
    "jwk",
    { kty: "OKP", crv: "Ed25519", x: jwk.x, d: jwk.d },
    ED25519,
    false,
    ["sign"],
  );
}

/**
 * Parse a private JWK from an env var. The key ID comes from the explicit
 * argument, else the JWK's own `kid`. Never echoes key material in errors.
 */
export async function signingKeyFromEnv(
  raw: string | undefined,
  keyId?: string,
): Promise<SigningKey> {
  if (!raw) throw new Error("signing key is not configured");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("signing key is not valid JSON");
  }
  const d = (parsed as { d?: unknown } | null)?.d;
  if (!isEd25519PublicJwk(parsed) || typeof d !== "string") {
    throw new Error("signing key is not an Ed25519 private JWK");
  }
  const kid = keyId ?? parsed.kid;
  if (!kid) throw new Error("signing key has no key ID");
  return { keyId: kid, privateKey: await importPrivateJwk({ ...parsed, d }) };
}

export async function generateEd25519Jwk(
  kid: string,
): Promise<{ privateJwk: Ed25519PrivateJwk; publicJwk: Ed25519PublicJwk }> {
  if ((await ed25519Backend()) === "noble") {
    const d = nobleRandomPrivateKey();
    return jwkPair(kid, toBase64Url(noblePublicKeyOf(d)), toBase64Url(d));
  }
  const pair = (await crypto.subtle.generateKey(ED25519, true, [
    "sign",
    "verify",
  ])) as CryptoKeyPair;
  const priv = await crypto.subtle.exportKey("jwk", pair.privateKey);
  if (!priv.x || !priv.d) throw new Error("key export failed");
  return jwkPair(kid, priv.x, priv.d);
}

function jwkPair(kid: string, x: string, d: string) {
  const publicJwk: Ed25519PublicJwk = { kty: "OKP", crv: "Ed25519", x, kid };
  return { privateJwk: { ...publicJwk, d }, publicJwk };
}
