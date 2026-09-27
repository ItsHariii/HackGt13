import { describe, expect, it } from "vitest";
import { json, mockFetch } from "../test-utils";
import { createShopifyTokenSource, SHOPIFY_TOKEN_URL } from "./shopify-auth";

describe("createShopifyTokenSource", () => {
  it("exchanges client credentials once and reuses the token until shortly before expiry", async () => {
    let clock = 0;
    let n = 0;
    const { fetch, calls } = mockFetch(() =>
      json({ access_token: `tok_${++n}`, expires_in: 3600 }),
    );
    const token = createShopifyTokenSource({
      clientId: "id",
      clientSecret: "secret",
      fetch,
      now: () => clock,
    });
    const [a, b] = await Promise.all([token(), token()]);
    expect([a, b]).toEqual(["tok_1", "tok_1"]);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(SHOPIFY_TOKEN_URL);
    expect(JSON.parse(calls[0]?.body ?? "{}")).toEqual({
      client_id: "id",
      client_secret: "secret",
      grant_type: "client_credentials",
    });
    clock = 54 * 60_000; // still inside the renewal window
    expect(await token()).toBe("tok_1");
    clock = 56 * 60_000; // within five minutes of expiry: renew
    expect(await token()).toBe("tok_2");
    expect(calls).toHaveLength(2);
  });

  it("fails loudly on a rejected credential and retries on the next call", async () => {
    let ok = false;
    const { fetch } = mockFetch(() =>
      ok
        ? json({ access_token: "tok" })
        : json({ error: "invalid_client" }, { status: 401 }),
    );
    const token = createShopifyTokenSource({
      clientId: "id",
      clientSecret: "bad",
      fetch,
    });
    await expect(token()).rejects.toMatchObject({ kind: "http", status: 401 });
    ok = true;
    expect(await token()).toBe("tok");
  });

  it("refuses to start without credentials", () => {
    expect(() =>
      createShopifyTokenSource({ clientId: "", clientSecret: "x" }),
    ).toThrow(/SHOPIFY_CLIENT_ID/);
  });
});
