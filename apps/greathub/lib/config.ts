import "server-only";
import { isConfigured, isHttpUrl } from "@cartel/platform/env";
import { headers } from "next/headers";

/** GreatHub's own identity as a merchant (grant `merchantId` and `aud`). */
export const MERCHANT_ID = "greathub";

/**
 * The origin agents sign for and grants are scoped to. Pin it with
 * GREATHUB_PUBLIC_ORIGIN in production rather than trusting the Host header.
 */
export function merchantOrigin(request?: Request): string {
  const pinned = process.env.GREATHUB_PUBLIC_ORIGIN;
  if (isHttpUrl(pinned)) return new URL(pinned).origin;
  if (request) return new URL(request.url).origin;
  return "http://localhost:3001";
}

/** The same origin, for server components (no Request object). */
export async function pageOrigin(): Promise<string> {
  const pinned = process.env.GREATHUB_PUBLIC_ORIGIN;
  if (isHttpUrl(pinned)) return new URL(pinned).origin;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return "http://localhost:3001";
  const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);
  return `${h.get("x-forwarded-proto") ?? (local ? "http" : "https")}://${host}`;
}

export function cartelJwksUrl(): string | null {
  const url = process.env.CARTEL_JWKS_URL;
  return isHttpUrl(url) ? url : null;
}

function cartelBase(): URL | null {
  const base = process.env.CARTEL_BASE_URL;
  return isHttpUrl(base) ? new URL(base) : null;
}

/** Where Cartel's WebAuthn ceremonies run; the contract signature must come from there. */
export function cartelWebAuthn(): { origin: string; rpId: string } | null {
  const origin = process.env.CARTEL_WEBAUTHN_ORIGIN ?? cartelBase()?.origin;
  const rpId = process.env.CARTEL_WEBAUTHN_RP_ID ?? cartelBase()?.hostname;
  if (!isHttpUrl(origin) || !isConfigured(rpId)) return null;
  return { origin: new URL(origin).origin, rpId };
}

/** Key-role binding: agent requests and grants must be signed by different keys. */
export function keyRoles() {
  return {
    agent: process.env.CARTEL_AGENT_KID_PREFIX || "ct-agent-",
    grant: process.env.CARTEL_GRANT_KID_PREFIX || "ct-grant-",
  };
}

export function cartelUrl(path: string): string | null {
  const base = cartelBase();
  return base ? new URL(path, base).toString() : null;
}

export function demoMode(): boolean {
  return process.env.DEMO_MODE !== "false";
}
