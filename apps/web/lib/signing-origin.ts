/*
 * Which browser origins may run the signing ceremony (T12.4). A passkey is
 * bound to its RP ID, so every allowed origin must be that host or one of its
 * subdomains: `localhost` on any port works for local dev, but two
 * `*.vercel.app` aliases can't share keys and only the configured one signs.
 */

/** `WEBAUTHN_ORIGIN` as a list of origins the RP ID can serve; others are dropped. */
export function allowedOrigins(
  raw: string | undefined,
  rpId: string,
): string[] {
  const out: string[] = [];
  for (const part of (raw ?? "").split(",")) {
    let url: URL;
    try {
      url = new URL(part.trim());
    } catch {
      continue;
    }
    const host = url.hostname;
    if (host !== rpId && !host.endsWith(`.${rpId}`)) continue;
    if (url.protocol !== "https:" && host !== "localhost") continue;
    if (!out.includes(url.origin)) out.push(url.origin);
  }
  return out;
}

/** The allowed origin a request came from, or null. */
export function matchOrigin(
  requestOrigin: string | null,
  origins: readonly string[],
): string | null {
  return requestOrigin && origins.includes(requestOrigin)
    ? requestOrigin
    : null;
}
