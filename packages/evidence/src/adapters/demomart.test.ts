import { type CheckoutSession, tapSigner } from "@proofcart/acp";
import { homeOffice } from "@proofcart/rule-packs";
import {
  type Ed25519PublicKey,
  generateEd25519Jwk,
  importPrivateJwk,
  importPublicJwk,
  verifyRequest,
} from "@proofcart/tap";
import { beforeAll, describe, expect, it } from "vitest";
import { checkoutLines } from "../checkout";
import { json, memoryStore, mockFetch, type Route } from "../test-utils";
import { createDemoMartAdapter } from "./demomart";

const BASE = "http://localhost:3001";

export function vireoSession(
  over: { pdWatts?: number; price?: number; finalSale?: boolean } = {},
): CheckoutSession {
  const price = over.price ?? 32900;
  return {
    id: "cs_123",
    status: "ready_for_payment",
    currency: "usd",
    line_items: [
      {
        id: "li_1",
        item: {
          id: "M27Q-USBC",
          quantity: 2,
          x_proofcart: {
            title: "Vireo U2727 27-inch 4K USB-C Monitor",
            seller_id: "vireo-direct",
            gtin: "00812345000016",
            mpn: "U2727",
            ships_gtin: "00812345000016",
            final_sale: over.finalSale ?? false,
            return_policy: {
              returnable: !(over.finalSale ?? false),
              windowDays: 30,
              feeMinor: 0,
              finalSale: over.finalSale ?? false,
            },
            pack_size: 1,
            subscription: null,
            availability: "in_stock",
            delivery: { min_days: 2, max_days: 4 },
            spec_url: `${BASE}/p/vireo-u2727`,
            offer_id: "off_1",
            offer_revision: 3,
          },
        },
        base_amount: price * 2,
        discount: 0,
        subtotal: price * 2,
        tax: 0,
        total: price * 2,
      },
    ],
    fulfillment_options: [
      {
        type: "shipping",
        id: "ship_standard",
        title: "Standard",
        earliest_delivery_time: "2026-09-28T00:00:00Z",
        latest_delivery_time: "2026-09-30T23:59:59Z",
        subtotal: 0,
        tax: 0,
        total: 0,
      },
    ],
    fulfillment_option_id: "ship_standard",
    totals: [{ type: "total", display_text: "Total", amount: price * 2 }],
    messages: [],
    links: [],
  };
}

const PAGE = (pd: string) =>
  `<html><head><script type="application/ld+json">${JSON.stringify({
    "@type": "Product",
    name: "Vireo U2727",
    additionalProperty: [
      { name: "USB-C power delivery", value: pd },
      { name: "Screen size", value: "27 in" },
    ],
  })}</script></head><body>Test merchant</body></html>`;

let signer: ReturnType<typeof tapSigner>;
let publicKey: Ed25519PublicKey;

beforeAll(async () => {
  const { privateJwk, publicJwk } = await generateEd25519Jwk("pc-agent-test");
  signer = tapSigner({
    keyId: "pc-agent-test",
    privateKey: await importPrivateJwk(privateJwk),
  });
  publicKey = await importPublicJwk(publicJwk);
});

/** A DemoMart stand-in that rejects any request whose RFC 9421 signature doesn't verify. */
function demomart(handler: Route) {
  const verified: string[] = [];
  const m = mockFetch(async (req) => {
    const v = await verifyRequest(
      { method: req.method, url: req.url.toString(), headers: req.headers },
      {
        body: req.body,
        resolveKey: async (kid) => (kid === "pc-agent-test" ? publicKey : null),
        requireNonce: true,
      },
    );
    if (!v.ok)
      return json(
        { type: "unauthorized", code: v.reason, message: "bad signature" },
        { status: 401 },
      );
    verified.push(`${req.method} ${req.url.pathname} ${v.signature.tag}`);
    return handler(req);
  });
  return { ...m, verified };
}

describe("checkoutLines", () => {
  it("reads verified offer facts from the checkout, with delivery only an estimate", () => {
    const [line] = checkoutLines(vireoSession(), "2026-09-26T10:00:00.000Z");
    const by = Object.fromEntries(
      (line?.claims ?? []).map((c) => [c.field, c]),
    );
    expect(by["offer.price"]).toMatchObject({
      value: { amountMinor: 32900, currency: "USD" },
      state: "verified",
      extractor: "checkout",
    });
    expect(by["offer.final_sale"]).toMatchObject({
      value: false,
      state: "verified",
    });
    expect(by["offer.return_window_days"]?.value).toEqual({
      value: 30,
      unit: "day",
    });
    expect(by["offer.seller"]?.value).toBe("vireo-direct");
    expect(by["offer.delivery_by"]).toMatchObject({
      value: "2026-09-30",
      state: "estimated",
    });
    expect(line?.offer).toMatchObject({
      itemId: "M27Q-USBC",
      priceMinor: 32900,
      deliveryLatest: "2026-09-30",
      freshUntil: "2026-09-26T10:01:00.000Z",
    });
  });

  it("yields price only for a line without DemoMart's extension, and none for an uneven total", () => {
    const s = vireoSession();
    const [line] = s.line_items;
    const bare = {
      ...s,
      line_items: [
        { ...line, item: { id: "X", quantity: 3 }, base_amount: 1000 },
      ],
    } as CheckoutSession;
    const [out] = checkoutLines(bare, "2026-09-26T10:00:00.000Z");
    expect(out?.claims.map((c) => [c.field, c.state])).toEqual([
      ["offer.price", "unknown"],
      ["offer.delivery_by", "estimated"],
    ]);
  });
});

describe("DemoMart adapter", () => {
  it("reads a signed product page and extracts its JSON-LD claims", async () => {
    const { store, sources } = memoryStore();
    const dm = demomart(
      () =>
        new Response(PAGE("90 W"), {
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
    );
    const adapter = createDemoMartAdapter({
      baseUrl: BASE,
      store,
      fetch: dm.fetch,
      signer,
    });
    const res = await adapter.refreshSpecs(
      { slug: "vireo-u2727", roles: ["monitor"] },
      [homeOffice],
    );
    expect(dm.verified).toEqual(["GET /p/vireo-u2727 agent-browser-auth"]);
    expect(res.found).toBe(true);
    expect(
      res.claims.find((c) => c.field === "monitor.usb_c_pd_watts")?.value,
    ).toEqual({ value: 90, unit: "W" });
    expect(sources[0]).toMatchObject({
      sourceType: "json_ld",
      contentType: "text/html",
      httpStatus: 200,
    });
  });

  it("refuses to read pages that aren't DemoMart's", async () => {
    const adapter = createDemoMartAdapter({
      baseUrl: BASE,
      store: memoryStore().store,
      fetch: demomart(() => json({})).fetch,
      signer,
    });
    await expect(
      adapter.refreshSpecs(
        { url: "http://localhost:3001.evil.example/p/x", roles: [] },
        [homeOffice],
      ),
    ).rejects.toMatchObject({
      kind: "invalid_response",
    });
  });

  it("snapshots the exact checkout bytes before parsing them", async () => {
    const { store, objects } = memoryStore();
    const body = JSON.stringify(vireoSession());
    const dm = demomart(
      () =>
        new Response(body, { headers: { "content-type": "application/json" } }),
    );
    const read = await createDemoMartAdapter({
      baseUrl: BASE,
      store,
      fetch: dm.fetch,
      signer,
    }).getCheckout("cs_123");
    expect(read.source.sourceType).toBe("acp_checkout");
    expect(new TextDecoder().decode([...objects.values()][0]?.bytes)).toBe(
      body,
    );
    expect(read.lines[0]?.itemId).toBe("M27Q-USBC");
    expect(dm.calls[0]?.headers.get("api-version")).toBe("2025-09-12");
  });

  it("prices an item through a throwaway session, then cancels it", async () => {
    const dm = demomart((req) => {
      if (req.url.pathname === "/acp/checkout_sessions")
        return json(vireoSession({ price: 31900 }), { status: 201 });
      if (req.url.pathname.endsWith("/cancel"))
        return json({ ...vireoSession(), status: "canceled" });
      return json({}, { status: 404 });
    });
    const res = await createDemoMartAdapter({
      baseUrl: BASE,
      store: memoryStore().store,
      fetch: dm.fetch,
      signer,
    }).refreshOffer("M27Q-USBC");
    expect(dm.verified).toEqual([
      "POST /acp/checkout_sessions agent-browser-auth",
      "POST /acp/checkout_sessions/cs_123/cancel agent-browser-auth",
    ]);
    expect(JSON.parse(dm.calls[0]?.body ?? "{}")).toEqual({
      items: [{ id: "M27Q-USBC", quantity: 1 }],
    });
    expect(res.line?.offer.priceMinor).toBe(31900);
  });

  it("turns an ACP error into a source error, after snapshotting it", async () => {
    const { store, sources } = memoryStore();
    const dm = demomart(() =>
      json(
        {
          type: "invalid_request",
          code: "not_found",
          message: "no such session",
        },
        { status: 404 },
      ),
    );
    await expect(
      createDemoMartAdapter({
        baseUrl: BASE,
        store,
        fetch: dm.fetch,
        signer,
      }).getCheckout("nope"),
    ).rejects.toMatchObject({
      kind: "http",
      status: 404,
    });
    expect(sources[0]?.httpStatus).toBe(404);
  });

  it("is rejected by DemoMart without a signer", async () => {
    const dm = demomart(() => json({}));
    await expect(
      createDemoMartAdapter({
        baseUrl: BASE,
        store: memoryStore().store,
        fetch: dm.fetch,
      }).getCheckout("cs_123"),
    ).rejects.toMatchObject({
      status: 401,
    });
  });
});
