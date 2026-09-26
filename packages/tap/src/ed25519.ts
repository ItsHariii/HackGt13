// Ed25519 primitives. Web Crypto is the primary implementation; @noble/curves
// is the fallback for runtimes that don't implement the algorithm (SDD §13.3).
// Support is probed once and cached, so callers never choose a backend.

import { ed25519 } from "@noble/curves/ed25519";
import { buf } from "./base64";

export type Ed25519Backend = "webcrypto" | "noble";

/** An Ed25519 key held as raw bytes, verified and signed with @noble/curves. */
export interface NobleEd25519Key {
  readonly backend: "noble";
  readonly type: "public" | "private";
  readonly bytes: Uint8Array;
}

export type Ed25519PublicKey = CryptoKey | NobleEd25519Key;
export type Ed25519PrivateKey = CryptoKey | NobleEd25519Key;

export function isNobleKey(key: unknown): key is NobleEd25519Key {
  return (key as NobleEd25519Key | null)?.backend === "noble";
}

let probe: Promise<Ed25519Backend> | undefined;

/** Which backend this runtime uses. Probed once with a throwaway key pair. */
export function ed25519Backend(): Promise<Ed25519Backend> {
  probe ??= (async () => {
    try {
      await crypto.subtle.generateKey({ name: "Ed25519" }, true, [
        "sign",
        "verify",
      ]);
      return "webcrypto" as const;
    } catch {
      return "noble" as const;
    }
  })();
  return probe;
}

export function nobleKey(
  type: "public" | "private",
  bytes: Uint8Array,
): NobleEd25519Key {
  const expected = 32;
  if (bytes.length !== expected) {
    throw new Error(`Ed25519 ${type} key must be ${expected} bytes`);
  }
  return { backend: "noble", type, bytes };
}

export function noblePublicKeyOf(privateBytes: Uint8Array): Uint8Array {
  return ed25519.getPublicKey(privateBytes);
}

export function nobleRandomPrivateKey(): Uint8Array {
  return ed25519.utils.randomSecretKey();
}

export async function edSign(
  key: Ed25519PrivateKey,
  data: Uint8Array,
): Promise<Uint8Array> {
  if (isNobleKey(key)) {
    if (key.type !== "private")
      throw new Error("cannot sign with a public key");
    return ed25519.sign(data, key.bytes);
  }
  return new Uint8Array(
    await crypto.subtle.sign({ name: "Ed25519" }, key, buf(data)),
  );
}

export async function edVerify(
  key: Ed25519PublicKey,
  signature: Uint8Array,
  data: Uint8Array,
): Promise<boolean> {
  if (isNobleKey(key)) {
    try {
      return ed25519.verify(signature, data, key.bytes);
    } catch {
      // A malformed signature or point is a failed verification, not an error.
      return false;
    }
  }
  return crypto.subtle.verify(
    { name: "Ed25519" },
    key,
    buf(signature),
    buf(data),
  );
}
