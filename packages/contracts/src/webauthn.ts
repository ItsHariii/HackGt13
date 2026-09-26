import type { ContractSignature } from "./contract";
import type { Hash } from "./primitives";

/**
 * Offline verification of a stored WebAuthn assertion over a contract (SDD
 * §12.2). Anyone holding the signature record — GreatHub at `/complete`, or a
 * dispute reviewer with the Evidence Pack — can check it with Web Crypto only.
 */

export interface AssertionExpectations {
  bodyHash: Hash;
  /** Cartel's origin(s), e.g. `https://cartel.example`. */
  expectedOrigin: string | readonly string[];
  /** Cartel's RP ID, e.g. `cartel.example`. */
  expectedRpId: string;
  requireUserVerification?: boolean;
}

export type AssertionFailure =
  | "body_hash_mismatch"
  | "malformed"
  | "wrong_type"
  | "challenge_mismatch"
  | "wrong_origin"
  | "wrong_rp_id"
  | "user_not_present"
  | "user_not_verified"
  | "unsupported_key"
  | "bad_signature";

export type AssertionCheck =
  | { ok: true; nonce: string; userVerified: boolean; signCount: number }
  | { ok: false; reason: AssertionFailure };

const utf8 = new TextEncoder();

function b64url(input: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]*$/.test(input)) throw new TypeError("not base64url");
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function sha256(
  data: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", data));
}

function equal(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return d === 0;
}

/** ASN.1 DER `SEQUENCE { r INTEGER, s INTEGER }` → IEEE P1363 `r || s`. */
export function derToP1363(
  der: Uint8Array,
  size = 32,
): Uint8Array<ArrayBuffer> | null {
  let i = 0;
  const byte = () => der[i++];
  const len = () => {
    let l = byte();
    if (l === undefined) return -1;
    if (l & 0x80) {
      const n = l & 0x7f;
      l = 0;
      for (let k = 0; k < n; k++) l = (l << 8) | (byte() ?? 0);
    }
    return l;
  };
  if (byte() !== 0x30 || len() < 0) return null;
  const out = new Uint8Array(size * 2);
  for (const offset of [0, size]) {
    if (byte() !== 0x02) return null;
    const l = len();
    if (l <= 0 || i + l > der.length) return null;
    let int = der.subarray(i, i + l);
    i += l;
    while (int.length > size && int[0] === 0) int = int.subarray(1);
    if (int.length > size) return null;
    out.set(int, offset + size - int.length);
  }
  return i === der.length ? out : null;
}

async function importJwk(jwk: Record<string, unknown>): Promise<{
  key: CryptoKey;
  alg: AlgorithmIdentifier | EcdsaParams;
  der: boolean;
} | null> {
  try {
    if (jwk.kty === "EC" && jwk.crv === "P-256") {
      const key = await crypto.subtle.importKey(
        "jwk",
        { kty: "EC", crv: "P-256", x: jwk.x as string, y: jwk.y as string },
        { name: "ECDSA", namedCurve: "P-256" },
        false,
        ["verify"],
      );
      return { key, alg: { name: "ECDSA", hash: "SHA-256" }, der: true };
    }
    if (jwk.kty === "OKP" && jwk.crv === "Ed25519") {
      const key = await crypto.subtle.importKey(
        "jwk",
        { kty: "OKP", crv: "Ed25519", x: jwk.x as string },
        { name: "Ed25519" },
        false,
        ["verify"],
      );
      return { key, alg: { name: "Ed25519" }, der: false };
    }
    if (jwk.kty === "RSA") {
      const key = await crypto.subtle.importKey(
        "jwk",
        { kty: "RSA", n: jwk.n as string, e: jwk.e as string },
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["verify"],
      );
      return { key, alg: { name: "RSASSA-PKCS1-v1_5" }, der: false };
    }
  } catch {
    return null;
  }
  return null;
}

export async function verifyContractSignature(
  sig: ContractSignature,
  expect: AssertionExpectations,
): Promise<AssertionCheck> {
  const fail = (reason: AssertionFailure): AssertionCheck => ({
    ok: false,
    reason,
  });
  if (sig.bodyHash !== expect.bodyHash) return fail("body_hash_mismatch");

  let clientDataBytes: Uint8Array<ArrayBuffer>;
  let authData: Uint8Array<ArrayBuffer>;
  let signature: Uint8Array<ArrayBuffer>;
  let clientData: { type?: unknown; challenge?: unknown; origin?: unknown };
  let challenge: string;
  try {
    clientDataBytes = b64url(sig.clientDataJSON);
    authData = b64url(sig.authenticatorData);
    signature = b64url(sig.signature);
    clientData = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(clientDataBytes),
    );
    if (typeof clientData.challenge !== "string") return fail("malformed");
    challenge = new TextDecoder("utf-8", { fatal: true }).decode(
      b64url(clientData.challenge),
    );
  } catch {
    return fail("malformed");
  }
  if (authData.length < 37) return fail("malformed");
  if (clientData.type !== "webauthn.get") return fail("wrong_type");

  const m = /^ct1:([0-9a-f]{64}):([\x21-\x7e]{1,128})$/.exec(challenge);
  if (!m || `sha256:${m[1]}` !== expect.bodyHash)
    return fail("challenge_mismatch");

  const origins =
    typeof expect.expectedOrigin === "string"
      ? [expect.expectedOrigin]
      : expect.expectedOrigin;
  if (
    typeof clientData.origin !== "string" ||
    !origins.includes(clientData.origin)
  ) {
    return fail("wrong_origin");
  }
  if (
    !equal(
      authData.subarray(0, 32),
      await sha256(utf8.encode(expect.expectedRpId)),
    )
  ) {
    return fail("wrong_rp_id");
  }
  const flags = authData[32] ?? 0;
  if (!(flags & 0x01)) return fail("user_not_present");
  const userVerified = (flags & 0x04) !== 0;
  if ((expect.requireUserVerification ?? true) && !userVerified)
    return fail("user_not_verified");

  const imported = await importJwk(sig.publicKeyJwk);
  if (!imported) return fail("unsupported_key");
  const sigBytes = imported.der ? derToP1363(signature) : signature;
  if (!sigBytes) return fail("bad_signature");
  const signed = new Uint8Array(authData.length + 32);
  signed.set(authData);
  signed.set(await sha256(clientDataBytes), authData.length);
  const valid = await crypto.subtle.verify(
    imported.alg,
    imported.key,
    sigBytes,
    signed,
  );
  if (!valid) return fail("bad_signature");
  const view = new DataView(authData.buffer, authData.byteOffset + 33, 4);
  return {
    ok: true,
    nonce: m[2] as string,
    userVerified,
    signCount: view.getUint32(0),
  };
}
