import {
  createDemoMartAdapter,
  createIcecat,
  jsonLdClaims,
  normalizeUpcItem,
  snapshot,
  type UpcItem,
} from "@proofcart/evidence";
import dell from "@proofcart/evidence/fixtures/icecat-dell-u2723qe.json";
import search from "@proofcart/evidence/fixtures/upcitemdb-search-monitor.json";
import {
  drainQueue,
  enrichWithIcecat,
  FACT_REFRESH_QUEUE,
  factRefreshHandler,
  ingestProduct,
  supabaseEvidenceStore,
  supabaseQueueStore,
  writeClaims,
} from "@proofcart/evidence/supabase";
import { apparel, homeOffice, travel } from "@proofcart/rule-packs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, must } from "./fixtures";

// T7.9 + T7.10 end to end against local Supabase: a real UPCitemdb listing is
// ingested, Icecat enriches it by GTIN, and a seller page that disagrees is
// recorded as a conflict. Network calls are replaced by the captured responses.
const PACKS = [homeOffice, apparel, travel];
const DELL_GTIN = "00884116415589";
const store = supabaseEvidenceStore(admin);

async function cleanup() {
  await admin.from("products").delete().eq("gtin", DELL_GTIN);
}

beforeAll(cleanup);
afterAll(cleanup);

describe("evidence ingestion", () => {
  let productId = "";

  it("ingests a UPCitemdb monitor with reference-only offers and a snapshot in Storage", async () => {
    const item = (search.items as UpcItem[]).find(
      (i) => i.ean === "0884116415589",
    ) as UpcItem;
    const product = await normalizeUpcItem(item);
    if (!product) throw new Error("fixture item did not normalize");
    const source = await snapshot(
      {
        url: "https://api.upcitemdb.com/prod/trial/search?s=27%20inch%204K%20USB-C%20monitor&match_mode=0&type=product",
        sourceType: "upcitemdb",
        body: JSON.stringify(search),
        contentType: "application/json",
        httpStatus: 200,
      },
      store,
    );
    const res = await ingestProduct(admin, store, product, source, PACKS);
    expect(res.created).toBe(true);
    productId = res.productId;

    const row = must(
      await admin
        .from("products")
        .select("gtin, brand, roles")
        .eq("id", productId)
        .single(),
    );
    expect(row).toEqual({ gtin: DELL_GTIN, brand: "Dell", roles: ["monitor"] });
    const offers = must(
      await admin
        .from("offers")
        .select("reference_only, retrieved_at, fresh_until")
        .eq("product_id", productId),
    );
    expect(offers.length).toBe(Object.keys(res.offerIds).length);
    expect(
      offers.every((o) => o.reference_only && o.fresh_until === o.retrieved_at),
    ).toBe(true);

    const bytes = await store.getObject(source.storagePath as string);
    expect(new TextDecoder().decode(bytes as Uint8Array)).toBe(
      JSON.stringify(search),
    );
    expect(
      await store.findRecentSource(
        source.url,
        "upcitemdb",
        new Date(Date.now() - 60_000).toISOString(),
      ),
    ).toMatchObject({
      contentHash: source.contentHash,
    });

    // Ingesting the same listing again merges into the same product without duplicating offers.
    const again = await ingestProduct(admin, store, product, source, PACKS);
    expect(again).toMatchObject({ productId, created: false });
    expect(
      must(await admin.from("offers").select("id").eq("product_id", productId))
        .length,
    ).toBe(offers.length);
  });

  it("enriches it from Icecat by GTIN with verified manufacturer facts", async () => {
    const icecat = createIcecat({
      store,
      username: "test",
      fetch: async () =>
        new Response(JSON.stringify(dell), {
          headers: { "content-type": "application/json" },
        }),
    });
    const res = await enrichWithIcecat(
      admin,
      store,
      icecat,
      { id: productId, gtin: DELL_GTIN, roles: ["monitor"] },
      PACKS,
    );
    expect(res.found).toBe(true);
    expect(res.facts.insertedIds.length).toBeGreaterThanOrEqual(4);

    const facts = must(
      await admin
        .from("facts")
        .select("field, value, state, extractor, sources(source_type)")
        .eq("subject_id", productId)
        .is("superseded_by", null),
    );
    const pd = facts.find((f) => f.field === "monitor.usb_c_pd_watts");
    expect(pd).toMatchObject({
      value: { value: 90, unit: "W" },
      state: "verified",
      extractor: "icecat",
      sources: { source_type: "icecat" },
    });
    const refs = must(
      await admin
        .from("product_external_refs")
        .select("source")
        .eq("product_id", productId),
    );
    expect(refs.map((r) => r.source).sort()).toEqual(["icecat", "upcitemdb"]);
  });

  it("records a seller page that disagrees as a conflict (Sources disagree)", async () => {
    const page = await snapshot(
      {
        url: "https://seller.test/p/dell-u2723qe",
        sourceType: "json_ld",
        body: "<html>65 W</html>",
        contentType: "text/html",
        httpStatus: 200,
      },
      store,
    );
    const claims = jsonLdClaims(
      {
        "@type": "Product",
        additionalProperty: [{ name: "USB-C power delivery", value: "65 W" }],
      },
      { packs: PACKS, roles: ["monitor"] },
    );
    const res = await writeClaims(store, claims, { productId }, page, PACKS);
    expect(res.conflicts).toEqual([
      `product:${productId}:monitor.usb_c_pd_watts`,
    ]);
    const rows = must(
      await admin
        .from("facts")
        .select("extractor, state, conflict")
        .eq("subject_id", productId)
        .eq("field", "monitor.usb_c_pd_watts")
        .is("superseded_by", null)
        .order("extractor"),
    );
    expect(rows).toEqual([
      { extractor: "icecat", state: "verified", conflict: true },
      { extractor: "jsonld", state: "source_stated", conflict: true },
    ]);
    // Writing the same reading again is a no-op.
    expect(
      (await writeClaims(store, claims, { productId }, page, PACKS))
        .insertedIds,
    ).toEqual([]);
  });
});

describe("fact refresh worker", () => {
  // A seeded DemoMart offer; its row is restored afterwards so other suites see the seed.
  const SKU = "LOOP-C100-2M";
  let offer: {
    id: string;
    price_minor: number | null;
    retrieved_at: string;
    fresh_until: string;
  };

  beforeAll(async () => {
    const row = must(
      await admin
        .from("offers")
        .select(
          "id, price_minor, retrieved_at, fresh_until, products!inner(external_id)",
        )
        .eq("source", "demomart")
        .eq("products.external_id", SKU)
        .single(),
    );
    offer = {
      id: row.id,
      price_minor: row.price_minor,
      retrieved_at: row.retrieved_at,
      fresh_until: row.fresh_until,
    };
  });

  afterAll(async () => {
    await admin.from("facts").delete().eq("subject_id", offer.id);
    await admin
      .from("offers")
      .update({
        price_minor: offer.price_minor,
        retrieved_at: offer.retrieved_at,
        fresh_until: offer.fresh_until,
      })
      .eq("id", offer.id);
  });

  it("drains q_fact_refresh and re-prices the offer from a DemoMart checkout", async () => {
    const session = {
      id: "cs_refresh",
      status: "ready_for_payment",
      currency: "usd",
      line_items: [
        {
          id: "li_1",
          item: { id: SKU, quantity: 1 },
          base_amount: 1700,
          discount: 0,
          subtotal: 1700,
          tax: 0,
          total: 1700,
        },
      ],
      fulfillment_options: [],
      totals: [{ type: "total", display_text: "Total", amount: 1700 }],
      messages: [],
      links: [],
    };
    const seen: string[] = [];
    const demomart = createDemoMartAdapter({
      baseUrl: "http://demomart.test",
      store,
      fetch: async (input, init) => {
        seen.push(`${init?.method} ${new URL(String(input)).pathname}`);
        return new Response(JSON.stringify(session), {
          status: 201,
          headers: { "content-type": "application/json" },
        });
      },
    });
    const queue = supabaseQueueStore(admin);
    await queue.send(FACT_REFRESH_QUEUE, { offerId: offer.id });
    const res = await drainQueue(
      queue,
      FACT_REFRESH_QUEUE,
      factRefreshHandler({ db: admin, store, packs: PACKS, demomart }),
      {
        batch: 50,
      },
    );
    expect(res.handled).toBeGreaterThanOrEqual(1);
    expect(res.failed).toBe(0);
    expect(seen).toEqual([
      "POST /acp/checkout_sessions",
      "POST /acp/checkout_sessions/cs_refresh/cancel",
    ]);

    const row = must(
      await admin
        .from("offers")
        .select("price_minor, fresh_until")
        .eq("id", offer.id)
        .single(),
    );
    expect(row.price_minor).toBe(1700);
    expect(Date.parse(row.fresh_until)).toBeGreaterThan(Date.now());
    const price = must(
      await admin
        .from("facts")
        .select("value, state, extractor, sources(source_type)")
        .eq("subject_id", offer.id)
        .eq("field", "offer.price")
        .is("superseded_by", null)
        .single(),
    );
    expect(price).toEqual({
      value: { amountMinor: 1700, currency: "USD" },
      state: "verified",
      extractor: "checkout",
      sources: { source_type: "acp_checkout" },
    });
  });
});
