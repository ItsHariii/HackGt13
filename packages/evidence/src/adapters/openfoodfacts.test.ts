import { evaluateResults } from "@cartel/proof-engine";
import { grocery, homeOffice } from "@cartel/rule-packs";
import { describe, expect, it } from "vitest";
import nutella from "../__fixtures__/off-nutella.json";
import { json, memoryStore, mockFetch } from "../test-utils";
import {
  createOpenFoodFacts,
  type OffProduct,
  offClaims,
  offIdentity,
  offTagValues,
} from "./openfoodfacts";

// Live Open Food Facts record (2026-09-27), fields as the adapter requests them.
const NUTELLA = nutella.product as OffProduct;
const PACKS = [grocery, homeOffice];
const UA = "Cartel/0.1 (test)";

describe("offClaims", () => {
  it("reads allergens, ingredients and the gluten-free label, never better than source_stated", () => {
    const by = Object.fromEntries(
      offClaims(NUTELLA, { packs: PACKS }).map((c) => [c.field, c]),
    );
    expect(by["food.allergens"]).toMatchObject({
      value: ["milk", "nuts", "soybeans"],
      state: "source_stated",
      extractor: "openfoodfacts",
    });
    expect(by["food.traces"]?.value).toEqual([]);
    expect(by["food.ingredients"]?.value).toMatch(/^Sugar, vegetable fat/);
    expect(by["food.gluten_free"]).toMatchObject({
      value: true,
      raw: "en:no-gluten",
      state: "source_stated",
    });
  });

  it("makes no gluten claim when the label is absent", () => {
    const fields = offClaims(
      { ...NUTELLA, labels_tags: ["en:vegetarian"] },
      { packs: PACKS },
    ).map((c) => c.field);
    expect(fields).not.toContain("food.gluten_free");
  });

  it("claims nothing when the grocery pack isn't loaded", () => {
    expect(offClaims(NUTELLA, { packs: [homeOffice] })).toEqual([]);
  });

  it("keeps English tags only", () => {
    expect(
      offTagValues(["en:milk", "fr:lait", "en:milk", "en:Peanuts"]),
    ).toEqual(["milk", "peanuts"]);
  });

  it("extracts identity", () => {
    expect(offIdentity(NUTELLA)).toMatchObject({
      gtin: "03017620422003",
      title: "Nutella",
      brand: "Nutella",
    });
  });
});

describe("grocery pack with Open Food Facts facts", () => {
  it("fails an avoid-nuts rule on Nutella and passes gluten-free at source_stated", () => {
    const claims = offClaims(NUTELLA, { packs: PACKS });
    const offer = {
      id: "off_1",
      productId: "p_nutella",
      merchant: "m",
      sellerId: "m",
      sku: "nutella",
      title: "Nutella",
      price: { amountMinor: 599, currency: "USD" },
      availability: "in_stock" as const,
      tier: "full" as const,
      terms: { finalSale: false, returnWindowDays: 30, returnFeeMinor: 0 },
    };
    const facts = claims.map((c, i) => ({
      id: `f${i}`,
      subjectKind: "product" as const,
      subjectId: "p_nutella",
      field: c.field,
      value: c.value,
      state: c.state,
      conflict: false,
      sourceId: "s_off",
      retrievedAt: "2026-09-27T12:00:00Z",
      freshUntil: "2026-10-04T12:00:00Z",
      extractor: c.extractor,
    }));
    const requirement = (
      id: string,
      field: string,
      op: "excludes" | "eq",
      target: string[] | boolean,
    ) => ({
      id,
      scope: "item" as const,
      role: "food",
      field,
      op,
      target,
      importance: "hard" as const,
      evidence: { minStateToPass: "source_stated" as const },
      materiality: "on_verdict_change" as const,
      provenance: { kind: "user_selected" as const },
    });
    const results = evaluateResults({
      requirements: [
        requirement("r_nuts", "food.allergens", "excludes", ["nuts"]),
        requirement("r_gf", "food.gluten_free", "eq", true),
      ],
      basket: { lines: [{ role: "food", offerId: "off_1", qty: 1 }] },
      offers: [offer],
      facts,
      packs: PACKS,
      now: "2026-09-27T13:00:00Z",
      sources: { s_off: { authority: "catalog" } },
    } as never);
    const verdict = Object.fromEntries(
      results.map((r) => [r.requirementId, r.verdict]),
    );
    expect(verdict).toEqual({ r_nuts: "fail", r_gf: "pass" });
  });
});

describe("Open Food Facts client", () => {
  it("looks up by barcode with the User-Agent and caches the answer", async () => {
    const { store } = memoryStore();
    const { fetch, calls } = mockFetch(() => json(nutella));
    const off = createOpenFoodFacts({ store, fetch, userAgent: UA });
    const first = await off.byGtin("3017620422003");
    const again = await off.byGtin("03017620422003");
    expect(first.product?.product_name).toBe("Nutella");
    expect(again.product?.product_name).toBe("Nutella");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toMatch(
      /^https:\/\/world\.openfoodfacts\.org\/api\/v2\/product\/3017620422003\.json\?fields=/,
    );
    expect(calls[0]?.headers.get("user-agent")).toBe(UA);
  });

  it("treats 'product not found' as no product, not an outage", async () => {
    const { store } = memoryStore();
    const { fetch } = mockFetch(() =>
      json({ status: 0, status_verbose: "product not found" }),
    );
    const off = createOpenFoodFacts({ store, fetch, userAgent: UA });
    expect((await off.byGtin("0000000000017")).product).toBeNull();
  });

  it("refuses to run without a User-Agent", () => {
    expect(() =>
      createOpenFoodFacts({ store: memoryStore().store, userAgent: " " }),
    ).toThrow(/OFF_USER_AGENT/);
  });
});
