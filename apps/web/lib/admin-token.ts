import "server-only";
import { isConfigured } from "@cartel/platform/env";

async function mac(key: string, message: string): Promise<string> {
  const k = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const bytes = new Uint8Array(
    await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(message)),
  );
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * `Authorization: Bearer <ADMIN_TOKEN>`, shared with GreatHub's Chaos Panel.
 * MACs are compared, so the check is constant-time whatever the input length.
 */
export async function adminTokenMatches(
  header: string | null,
): Promise<boolean> {
  const token = process.env.ADMIN_TOKEN;
  if (
    !isConfigured(token) ||
    token.length < 16 ||
    !header?.startsWith("Bearer ")
  )
    return false;
  const [a, b] = await Promise.all([
    mac(token, header.slice(7)),
    mac(token, token),
  ]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
