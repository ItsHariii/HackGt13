import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { signWebhook, verifyWebhook } from "./webhook-signature";

describe("order webhook signature", () => {
  const secret = "whsec_test_0123456789";
  const body = JSON.stringify({ type: "order_created", event_id: "evt_1" });
  const t = 1_790_000_000;

  it("is HMAC-SHA256 over t.body", async () => {
    const expected = createHmac("sha256", secret)
      .update(`${t}.${body}`)
      .digest("hex");
    expect(await signWebhook(secret, body, t)).toBe(`t=${t},v1=${expected}`);
  });
  it("verifies within 5 minutes and rejects tampering, replays and bad secrets", async () => {
    const header = await signWebhook(secret, body, t);
    expect(await verifyWebhook(secret, body, header, t + 299)).toBe(true);
    expect(await verifyWebhook(secret, body, header, t + 301)).toBe(false);
    expect(await verifyWebhook(secret, `${body} `, header, t)).toBe(false);
    expect(await verifyWebhook("other", body, header, t)).toBe(false);
    expect(await verifyWebhook(secret, body, null, t)).toBe(false);
    expect(await verifyWebhook(secret, body, "v1=abc", t)).toBe(false);
  });
});
