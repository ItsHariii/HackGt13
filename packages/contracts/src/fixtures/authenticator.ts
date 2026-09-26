import type { ContractSignature } from "../contract";
import { signingChallenge } from "../contract";
import type { Hash } from "../primitives";

/**
 * A software authenticator for tests: produces real WebAuthn assertions (ES256
 * with DER signatures, or Ed25519) over a contract hash. Never use outside tests.
 */

function b64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** IEEE P1363 `r || s` → ASN.1 DER, as authenticators emit for ES256. */
export function p1363ToDer(raw: Uint8Array): Uint8Array {
  const half = raw.length / 2;
  const int = (bytes: Uint8Array) => {
    let i = 0;
    while (i < bytes.length - 1 && bytes[i] === 0) i++;
    let v = bytes.subarray(i);
    if ((v[0] ?? 0) & 0x80) v = Uint8Array.of(0, ...v);
    return Uint8Array.of(0x02, v.length, ...v);
  };
  const r = int(raw.subarray(0, half));
  const s = int(raw.subarray(half));
  return Uint8Array.of(0x30, r.length + s.length, ...r, ...s);
}

export interface TestAuthenticator {
  credentialId: string;
  publicKeyJwk: Record<string, unknown>;
  sign(input: {
    bodyHash: Hash;
    nonce?: string;
    origin: string;
    rpId: string;
    userVerified?: boolean;
    type?: string;
    signedAt?: string;
  }): Promise<ContractSignature>;
}

export async function createTestAuthenticator(
  alg: "ES256" | "EdDSA" = "ES256",
): Promise<TestAuthenticator> {
  const params =
    alg === "ES256"
      ? ({ name: "ECDSA", namedCurve: "P-256" } as const)
      : ({ name: "Ed25519" } as const);
  const pair = (await crypto.subtle.generateKey(params, true, [
    "sign",
    "verify",
  ])) as CryptoKeyPair;
  const jwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  const publicKeyJwk: Record<string, unknown> =
    alg === "ES256"
      ? { kty: "EC", crv: "P-256", x: jwk.x, y: jwk.y }
      : { kty: "OKP", crv: "Ed25519", x: jwk.x };
  const credentialId = b64url(crypto.getRandomValues(new Uint8Array(16)));
  let counter = 0;

  return {
    credentialId,
    publicKeyJwk,
    async sign({
      bodyHash,
      nonce,
      origin,
      rpId,
      userVerified = true,
      type = "webauthn.get",
      signedAt,
    }) {
      const challenge = signingChallenge(
        bodyHash,
        nonce ?? b64url(crypto.getRandomValues(new Uint8Array(18))),
      );
      const clientDataJSON = new TextEncoder().encode(
        JSON.stringify({
          type,
          challenge: b64url(new TextEncoder().encode(challenge)),
          origin,
          crossOrigin: false,
        }),
      );
      const rpIdHash = new Uint8Array(
        await crypto.subtle.digest("SHA-256", new TextEncoder().encode(rpId)),
      );
      counter++;
      const authData = new Uint8Array(37);
      authData.set(rpIdHash);
      authData[32] = 0x01 | (userVerified ? 0x04 : 0);
      new DataView(authData.buffer).setUint32(33, counter);
      const clientHash = new Uint8Array(
        await crypto.subtle.digest("SHA-256", clientDataJSON),
      );
      const signed = new Uint8Array(authData.length + 32);
      signed.set(authData);
      signed.set(clientHash, authData.length);
      const raw = new Uint8Array(
        await crypto.subtle.sign(
          alg === "ES256"
            ? { name: "ECDSA", hash: "SHA-256" }
            : { name: "Ed25519" },
          pair.privateKey,
          signed,
        ),
      );
      return {
        bodyHash,
        credentialId,
        authenticatorData: b64url(authData),
        clientDataJSON: b64url(clientDataJSON),
        signature: b64url(alg === "ES256" ? p1363ToDer(raw) : raw),
        publicKeyJwk,
        signedAt: signedAt ?? new Date().toISOString(),
      };
    },
  };
}
