import { describe, expect, it } from "vitest";
import search from "../__fixtures__/upcitemdb-search-monitor.json";
import { json, memoryStore, mockFetch } from "../test-utils";
import {
  createUpcItemDb,
  newRateBudget,
  normalizeUpcItem,
  type UpcItem,
} from "./upcitemdb";

// Live trial response for "27 inch 4K USB-C monitor" (2026-09-26), trimmed to four items.
const ITEMS = search.items as UpcItem[];

describe("normalizeUpcItem", () => {
  it("maps identity: GTIN-14, brand, model, category, roles and an https image", async () => {
    const p = await normalizeUpcItem(ITEMS[0] as UpcItem);
    expect(p).toMatchObject({
      source: "upcitemdb",
      externalId: "00766907902112",
      gtin: "00766907902112",
      brand: "ViewSonic",
      mpn: "VP2785-4K",
      category: "Electronics > Video > Computer Monitors",
      roles: ["monitor"],
    });
    expect(p?.imageUrl).toMatch(/^https:\/\//);
    expect(p?.facts).toEqual([]);
    expect(p?.attributes.weight).toBe("22.15 lb");
  });

  it("turns retailer listings into reference-only offers that are never fresh", async () => {
    const p = await normalizeUpcItem(ITEMS[0] as UpcItem);
    const offers = p?.offers ?? [];
    expect(offers.length).toBeGreaterThan(0);
    for (const o of offers) {
      expect(o.referenceOnly).toBe(true);
      expect(o.freshUntil).toBe(o.retrievedAt);
    }
    const officeDepot = offers.find((o) => o.merchantId === "officedepot.com");
    expect(officeDepot).toMatchObject({
      priceMinor: 89999,
      currency: "USD",
      sellerId: "Office Depot",
    });
    expect(officeDepot?.retrievedAt).toBe(
      new Date(1706517909 * 1000).toISOString(),
    );
    expect(offers.find((o) => o.merchantId === "newegg.ca")?.currency).toBe(
      "CAD",
    );
    expect(
      offers.find((o) => o.merchantId === "neweggbusiness.com")?.availability,
    ).toBe("out_of_stock");
  });

  it("gives each listing a stable ID that ignores the link's per-request sequence", async () => {
    const a = await normalizeUpcItem(ITEMS[0] as UpcItem);
    const relinked = {
      ...(ITEMS[0] as UpcItem),
      offers: (ITEMS[0]?.offers ?? []).map((o) => ({
        ...o,
        link: `${o.link}&seq=999`,
      })),
    };
    const b = await normalizeUpcItem(relinked);
    expect(b?.offers.map((o) => o.externalId)).toEqual(
      a?.offers.map((o) => o.externalId),
    );
    expect(new Set(a?.offers.map((o) => o.externalId)).size).toBe(
      a?.offers.length,
    );
  });

  it("returns real monitors with GTIN, brand and model for the acceptance query", async () => {
    const products = (await Promise.all(ITEMS.map(normalizeUpcItem))).filter(
      (p) => p !== null,
    );
    expect(products.length).toBe(4);
    for (const p of products) {
      expect(p.gtin).toMatch(/^\d{14}$/);
      expect(p.brand).toBeTruthy();
      expect(p.mpn).toBeTruthy();
    }
  });

  it("skips items without a valid GTIN", async () => {
    expect(
      await normalizeUpcItem({
        ean: "0766907902113",
        title: "Bad check digit",
      }),
    ).toBeNull();
  });
});

describe("UPCitemdb client", () => {
  const ok = (remaining: number) =>
    json(search, {
      headers: {
        "x-ratelimit-remaining": String(remaining),
        "x-ratelimit-reset": "1790488445",
      },
    });

  it("uses the trial tier without a key and the paid tier with one", async () => {
    const trial = mockFetch(() => ok(90));
    await createUpcItemDb({
      store: memoryStore().store,
      fetch: trial.fetch,
    }).search("27 inch 4K USB-C monitor");
    expect(trial.calls[0]?.url).toBe(
      "https://api.upcitemdb.com/prod/trial/search?s=27%20inch%204K%20USB-C%20monitor&match_mode=0&type=product",
    );
    expect(trial.calls[0]?.headers.get("user_key")).toBeNull();

    const paid = mockFetch(() => ok(90));
    await createUpcItemDb({
      store: memoryStore().store,
      fetch: paid.fetch,
      userKey: "k123",
    }).lookup("766907902112");
    expect(paid.calls[0]?.url).toBe(
      "https://api.upcitemdb.com/prod/v1/lookup?upc=766907902112",
    );
    expect(paid.calls[0]?.headers.get("user_key")).toBe("k123");
  });

  it("serves repeats from the snapshot cache", async () => {
    const { fetch, calls } = mockFetch(() => ok(90));
    const upc = createUpcItemDb({ store: memoryStore().store, fetch });
    const a = await upc.search("monitor");
    const b = await upc.search("monitor");
    expect(calls).toHaveLength(1);
    expect(b.source.cached).toBe(true);
    expect(b.products.map((p) => p.gtin)).toEqual(
      a.products.map((p) => p.gtin),
    );
  });

  it("stops calling at 5 remaining until the quota resets", async () => {
    const budget = newRateBudget();
    let now = new Date("2026-09-26T10:00:00Z");
    const { fetch, calls } = mockFetch(() => ok(5));
    const upc = createUpcItemDb({
      store: memoryStore().store,
      fetch,
      budget,
      now: () => now,
    });
    await upc.search("first");
    await expect(upc.search("second")).rejects.toMatchObject({
      kind: "rate_limited",
    });
    expect(calls).toHaveLength(1);
    now = new Date(1790488446 * 1000);
    await upc.search("third");
    expect(calls).toHaveLength(2);
  });

  it("maps a 429 to rate_limited and a miss to no products", async () => {
    const limited = mockFetch(() =>
      json(
        { code: "TOO_FAST", message: "slow down" },
        { status: 429, headers: { "retry-after": "30" } },
      ),
    );
    await expect(
      createUpcItemDb({
        store: memoryStore().store,
        fetch: limited.fetch,
      }).lookup("1"),
    ).rejects.toMatchObject({
      kind: "rate_limited",
      retryAfterMs: 30_000,
    });
    const miss = mockFetch(() =>
      json({ code: "INVALID_UPC", message: "Invalid UPC" }, { status: 400 }),
    );
    expect(
      (
        await createUpcItemDb({
          store: memoryStore().store,
          fetch: miss.fetch,
        }).lookup("123")
      ).products,
    ).toEqual([]);
  });
});
