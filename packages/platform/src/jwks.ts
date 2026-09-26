import { createPrivateKey, createPublicKey } from "node:crypto";
import { isConfigured } from "./env";

/** Derive from the private key; never return arbitrary properties from input. */
export function publicJwks(raw: string | undefined, kid: string | undefined) {
  if (!isConfigured(raw) || !isConfigured(kid)) return null;
  try {
    const input = JSON.parse(raw);
    if (input.kty !== "OKP" || input.crv !== "Ed25519" || !input.d) return null;
    const key = createPublicKey(
      createPrivateKey({ key: input, format: "jwk" }),
    ).export({ format: "jwk" });
    return {
      keys: [
        { kty: key.kty, crv: key.crv, x: key.x, kid, use: "sig", alg: "EdDSA" },
      ],
    };
  } catch {
    return null;
  }
}
