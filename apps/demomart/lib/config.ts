import "server-only";
import { isConfigured, isHttpUrl } from "@proofcart/platform/env";
import { headers } from "next/headers";

/** DemoMart's own identity as a merchant (grant `merchantId` and `aud`). */
export const MERCHANT_ID = "demomart";

/**
 * The origin agents sign for and grants are scoped to. Pin it with
 * DEMOMART_PUBLIC_ORIGIN in production rather than trusting the Host header.
 */
export function merchantOrigin(request?: Request): string {
  const pinned = process.env.DEMOMART_PUBLIC_ORIGIN;
  if (isHttpUrl(pinned)) return new URL(pinned).origin;
  if (request) return new URL(request.url).origin;
  return "http://localhost:3001";
}

/** The same origin, for server components (no Request object). */
export async function pageOrigin(): Promise<string> {
  const pinned = process.env.DEMOMART_PUBLIC_ORIGIN;
  if (isHttpUrl(pinned)) return new URL(pinned).origin;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return "http://localhost:3001";
  const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);
  return `${h.get("x-forwarded-proto") ?? (local ? "http" : "https")}://${host}`;
}

export function proofcartJwksUrl(): string | null {
  const url = process.env.PROOFCART_JWKS_URL;
  return isHttpUrl(url) ? url : null;
}

function proofcartBase(): URL | null {
  const base = process.env.PROOFCART_BASE_URL;
  return isHttpUrl(base) ? new URL(base) : null;
}

/** Where ProofCart's WebAuthn ceremonies run; the contract signature must come from there. */
export function proofcartWebAuthn(): { origin: string; rpId: string } | null {
  const origin =
    process.env.PROOFCART_WEBAUTHN_ORIGIN ?? proofcartBase()?.origin;
  const rpId =
    process.env.PROOFCART_WEBAUTHN_RP_ID ?? proofcartBase()?.hostname;
  if (!isHttpUrl(origin) || !isConfigured(rpId)) return null;
  return { origin: new URL(origin).origin, rpId };
}

/** Key-role binding: agent requests and grants must be signed by different keys. */
export function keyRoles() {
  return {
    agent: process.env.PROOFCART_AGENT_KID_PREFIX || "pc-agent-",
    grant: process.env.PROOFCART_GRANT_KID_PREFIX || "pc-grant-",
  };
}

export function proofcartUrl(path: string): string | null {
  const base = proofcartBase();
  return base ? new URL(path, base).toString() : null;
}

export function demoMode(): boolean {
  return process.env.DEMO_MODE !== "false";
}
