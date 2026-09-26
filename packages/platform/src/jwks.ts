import { createPrivateKey, createPublicKey } from "node:crypto";
import { isConfigured } from "./env";

type PublicJwk = {
  kty: string | undefined;
  crv: string | undefined;
  x: string | undefined;
  kid: string;
  use: "sig";
  alg: "EdDSA";
};

/** Derive from the private key; never return arbitrary properties from input. */
function publicKey(
  raw: string | undefined,
  kid: string | undefined,
): PublicJwk | null {
  if (!isConfigured(raw)) return null;
  try {
    const input = JSON.parse(raw);
    if (input.kty !== "OKP" || input.crv !== "Ed25519" || !input.d) return null;
    const id = isConfigured(kid) ? kid : input.kid;
    if (!isConfigured(id)) return null;
    const key = createPublicKey(
      createPrivateKey({ key: input, format: "jwk" }),
    ).export({
      format: "jwk",
    });
    return {
      kty: key.kty,
      crv: key.crv,
      x: key.x,
      kid: id,
      use: "sig",
      alg: "EdDSA",
    };
  } catch {
    return null;
  }
}

export function publicJwks(raw: string | undefined, kid: string | undefined) {
  const key = isConfigured(kid) ? publicKey(raw, kid) : null;
  return key ? { keys: [key] } : null;
}

/**
 * ProofCart's JWKS (SDD §13.3, T8.2): the agent key signs RFC 9421 requests and
 * the grant key signs scoped payment grants. Null unless the agent key is set.
 * `previous` keeps retired kids published so in-flight signatures still verify.
 */
export function proofcartJwks(env: {
  agentJwk: string | undefined;
  agentKid: string | undefined;
  grantJwk: string | undefined;
  grantKid?: string | undefined;
  previous?: ReadonlyArray<{
    jwk: string | undefined;
    kid: string | undefined;
  }>;
}) {
  const agent = isConfigured(env.agentKid)
    ? publicKey(env.agentJwk, env.agentKid)
    : null;
  if (!agent) return null;
  const keys: PublicJwk[] = [agent];
  const seen = new Set<string>([agent.kid]);
  const grant = publicKey(env.grantJwk, env.grantKid);
  if (grant && !seen.has(grant.kid)) {
    keys.push(grant);
    seen.add(grant.kid);
  }
  for (const extra of env.previous ?? []) {
    const key = publicKey(extra.jwk, extra.kid);
    if (!key || seen.has(key.kid)) continue;
    keys.push(key);
    seen.add(key.kid);
  }
  return { keys };
}
