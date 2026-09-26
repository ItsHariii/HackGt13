import "server-only";
import { isConfigured } from "@cartel/platform/env";
import { cookies } from "next/headers";
import { merchantOrigin } from "./config";

export const ADMIN_COOKIE = "dm_admin";

function adminToken(): string | null {
  const token = process.env.CHAOS_ADMIN_TOKEN;
  return isConfigured(token) && token.length >= 16 ? token : null;
}

async function hmacHex(key: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = new Uint8Array(
    await crypto.subtle.sign("HMAC", k, enc.encode(message)),
  );
  return [...mac].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** The cookie holds a MAC derived from the token, never the token itself. */
export async function sessionValue(): Promise<string | null> {
  const token = adminToken();
  return token ? hmacHex(token, "greathub-admin-session-v1") : null;
}

export async function tokenMatches(candidate: string): Promise<boolean> {
  const token = adminToken();
  if (!token) return false;
  // Compare MACs so the comparison is constant-time regardless of length.
  return safeEqual(
    await hmacHex(token, candidate),
    await hmacHex(token, token),
  );
}

export function adminConfigured(): boolean {
  return adminToken() !== null;
}

/** For pages and server actions. */
export async function isAdminSession(): Promise<boolean> {
  const expected = await sessionValue();
  const actual = (await cookies()).get(ADMIN_COOKIE)?.value;
  return !!expected && !!actual && safeEqual(actual, expected);
}

/**
 * For API routes: `Authorization: Bearer <CHAOS_ADMIN_TOKEN>` (scripts), or the
 * session cookie from a same-origin browser request (the panel).
 */
export async function isAdminRequest(request: Request): Promise<boolean> {
  const auth = request.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return tokenMatches(auth.slice(7));
  const origin = request.headers.get("origin");
  if (request.method !== "GET" && origin && origin !== merchantOrigin(request))
    return false;
  return isAdminSession();
}

export function forbidden(): Response {
  return Response.json(
    { error: "admin_required", message: "Sign in to the Chaos Panel first." },
    { status: 401, headers: { "Cache-Control": "no-store" } },
  );
}
