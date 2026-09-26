// Order webhook signing (SDD §13.1, §20.1): HMAC-SHA256 over `${t}.${body}`,
// sent as `X-Signature: t=<unix seconds>,v1=<hex>`. The receiver rejects
// timestamps more than 5 minutes off and dedupes on the event ID.

export const WEBHOOK_TOLERANCE_S = 300;

async function hmacHex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, enc.encode(message)),
  );
  return [...mac].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function signWebhook(
  secret: string,
  body: string,
  timestamp: number,
): Promise<string> {
  return `t=${timestamp},v1=${await hmacHex(secret, `${timestamp}.${body}`)}`;
}

/** Reference verifier for receivers (Cartel's T13.6 mirrors this). */
export async function verifyWebhook(
  secret: string,
  body: string,
  header: string | null,
  now = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  const m = header ? /^t=(\d{1,12}),v1=([0-9a-f]{64})$/.exec(header) : null;
  if (!m) return false;
  const t = Number(m[1]);
  if (Math.abs(now - t) > WEBHOOK_TOLERANCE_S) return false;
  const expected = await hmacHex(secret, `${t}.${body}`);
  let diff = 0;
  for (let i = 0; i < 64; i++)
    diff |= expected.charCodeAt(i) ^ (m[2] as string).charCodeAt(i);
  return diff === 0;
}
