import type { Fact, Requirement } from "@cartel/contracts";
import type { NormalizedProduct } from "@cartel/evidence";
import { apparel, homeOffice } from "@cartel/rule-packs";
import { describe, expect, it, vi } from "vitest";
import { buildFacets, promoteToRule } from "./facets";
import {
  identityKey,
  mapGreatHub,
  normalizeProduct,
  transientSnapshotStore,
} from "./normalize";
import {
  type CatalogProduct,
  checkoutTier,
  fromTransient,
  productProof,
  rankProducts,
  specRows,
} from "./product";
import { type SearchChunk, searchStream } from "./search";

const now = "2026-09-26T12:00:00.000Z";
const packs = [homeOffice];
const rule = promoteToRule(
  "monitor.usb_c_pd_watts",
  "gte",
  { value: 65, unit: "W" },
  "facet",
  { role: "monitor", packs, id: "pd" },
);
const fact: Fact = {
  id: "f",
  subjectKind: "product",
  subjectId: "p",
  field: rule.field,
  value: { value: 90, unit: "W" },
  state: "source_stated",
  conflict: false,
  sourceId: "s",
  extractor: "fixture",
  retrievedAt: now,
};
const product: CatalogProduct = {
  id: "p",
  identityKey: "test:p",
  title: "USB-C Monitor",
  brand: null,
  gtin: null,
  mpn: null,
  upid: null,
  category: "monitors",
  roles: ["monitor"],
  imageUrl: null,
  attributes: {},
  refs: [],
  facts: [fact],
  sources: [
    {
      id: "s",
      url: "https://example.com/spec",
      sourceType: "icecat",
      contentHash: "a".repeat(64),
      contentType: "application/json",
      storagePath: null,
      httpStatus: 200,
      fetchedAt: now,
    },
  ],
  offers: [
    {
      id: "o",
      source: "upcitemdb",
      externalId: "ref",
      merchant: "retailer",
      sellerId: null,
      priceMinor: 100,
      currency: "USD",
      shippingMinor: null,
      availability: "unknown",
      referenceOnly: true,
      retrievedAt: now,
      freshUntil: now,
      url: null,
      tier: "proof_only",
    },
  ],
  rank: 0.5,
  proof: [],
};

describe("normalization and proof", () => {
  it("parses only ontology claims, retaining untyped attributes outside evidence", () => {
    const input: NormalizedProduct = {
      source: "greathub",
      externalId: "test",
      title: "Monitor",
      roles: ["monitor"],
      attributes: { magic: "100%" },
      offers: [],
      facts: [
        {
          field: rule.field,
          value: "65 watts",
          state: "source_stated",
          extractor: "fixture",
        },
        {
          field: "monitor.magic",
          value: true,
          state: "verified",
          extractor: "fixture",
        },
      ],
    };
    const mapped = normalizeProduct(input, packs);
    expect(mapped.attributes).toEqual({ magic: "100%" });
    expect(mapped.facts).toHaveLength(1);
    expect(mapped.facts[0]?.value).toEqual({ value: 65, unit: "W" });
    expect(
      normalizeProduct(
        {
          ...input,
          facts: [
            {
              field: rule.field,
              extractor: "fixture",
              state: "source_stated",
              value: { value: 65, unit: "kg" },
            },
          ],
        },
        packs,
      ).facts[0]?.state,
    ).toBe("unknown");
  });
  it("uses GreatHub JSON-LD mapping and units", () => {
    const mapped = mapGreatHub(
      {
        externalId: "desk",
        title: "Desk",
        roles: ["desk"],
        attributes: {},
        offers: [],
      },
      { "@type": "Product", width: "118 cm" },
      packs,
    );
    expect(mapped.facts.find((f) => f.field === "desk.width")?.value).toEqual({
      value: 118,
      unit: "cm",
    });
  });
  it("canonicalizes UPC/EAN GTIN and prefers it to UPID/MPN", () => {
    expect(
      identityKey({
        source: "upcitemdb",
        externalId: "a",
        gtin: "012345678905",
        upid: "x",
      }),
    ).toBe(
      identityKey({ source: "icecat", externalId: "b", gtin: "0012345678905" }),
    );
    expect(
      identityKey({
        source: "x",
        externalId: "a",
        brand: " Dell ",
        mpn: " U2723 ",
      }),
    ).toBe('mpn:["dell","u2723"]');
  });
  it("keeps Shopify snapshots transient", async () => {
    const store = transientSnapshotStore();
    const original = product.sources[0];
    if (!original) throw new Error("fixture missing source");
    const source = await store.insertSource({
      ...original,
      storagePath: "not-saved",
    });
    expect(source.storagePath).toBeNull();
    expect(await store.getObject("not-saved")).toBeNull();
  });
  it("technical facts pass; reference price cannot pass even with an injected offer fact", () => {
    const price: Requirement = {
      ...rule,
      id: "price",
      field: "offer.price",
      op: "lte",
      target: { amountMinor: 10000, currency: "USD" },
    };
    const contaminated = {
      ...product,
      facts: [
        ...product.facts,
        {
          ...fact,
          id: "pf",
          subjectKind: "offer" as const,
          subjectId: "o",
          field: "offer.price",
          value: { amountMinor: 100, currency: "USD" },
          state: "verified" as const,
        },
      ],
    };
    const proofs = productProof(contaminated, [rule, price], packs, now);
    expect(proofs.find((r) => r.requirementId === "pd")?.verdict).toBe("pass");
    expect(proofs.find((r) => r.requirementId === "price")?.verdict).toBe(
      "unknown",
    );
  });
  it("recomputes freshness, shows conflicts and source age", () => {
    const stale = {
      ...product,
      facts: [{ ...fact, freshUntil: "2026-09-25T12:00:00.000Z" }],
    };
    expect(productProof(stale, [rule], packs, now)[0]?.reason).toBe("stale");
    const conflict: CatalogProduct = {
      ...product,
      facts: [fact, { ...fact, id: "other", value: { value: 30, unit: "W" } }],
    };
    expect(specRows(conflict, packs, now)[0]).toMatchObject({
      conflict: true,
      state: "unknown",
    });
    expect(specRows(product, packs, now)[0]?.evidence[0]).toMatchObject({
      ageMs: 0,
      source: { id: "s" },
    });
  });
  it("counts products, suppresses stale/conflicting facts, and records facet provenance", () => {
    const facets = buildFacets(
      [
        product,
        {
          ...product,
          id: "stale",
          facts: [{ ...fact, freshUntil: "2020-01-01T00:00:00Z" }],
        },
      ],
      packs,
      now,
    );
    expect(facets.find((f) => f.field === rule.field)?.values).toEqual([
      { value: { value: 90, unit: "W" }, count: 1 },
    ]);
    expect(rule.provenance).toMatchObject({
      kind: "user_selected",
      via: "facet",
    });
    expect(() =>
      promoteToRule("monitor.magic", "eq", true, "facet", {
        role: "monitor",
        packs,
      }),
    ).toThrow();
  });
  it("boosts passing hard rules without mutating cached products", () => {
    const bad = { ...product, id: "bad", rank: 1, facts: [] };
    expect(rankProducts([bad, product], [rule], packs, now)[0]?.id).toBe("p");
    expect(product.rank).toBe(0.5);
    expect(rankProducts([bad, product], [], packs, now)[0]?.id).toBe("bad");
  });
  it("does not evaluate basket/pair rules or unrelated roles on a product", () => {
    expect(
      productProof(
        product,
        [
          { ...rule, role: "desk" },
          { ...rule, scope: "basket" },
        ],
        packs,
        now,
      ),
    ).toEqual([]);
  });
  it("counts variant facets once per product and excludes conflicting variants", () => {
    const shirt: CatalogProduct = {
      ...product,
      roles: ["top"],
      offers: [
        {
          ...(product.offers[0] as CatalogProduct["offers"][number]),
          referenceOnly: false,
          source: "shopify",
          tier: "handoff",
        },
      ],
      facts: [
        {
          ...fact,
          field: "garment.color",
          subjectKind: "offer",
          subjectId: "o",
          value: "navy",
        },
      ],
    };
    expect(
      buildFacets([shirt], [apparel], now).find(
        (f) => f.field === "garment.color",
      )?.values,
    ).toEqual([{ value: "navy", count: 1 }]);
    const conflict = {
      ...shirt,
      facts: [
        ...shirt.facts,
        { ...fact, field: "garment.color", value: "red" },
      ],
    };
    expect(
      buildFacets([conflict], [apparel], now).find(
        (f) => f.field === "garment.color",
      )?.values,
    ).toEqual([]);
  });
  it("does not merge a Shopify variant group by its first GTIN or expose raw snapshots", () => {
    const source = product.sources[0];
    if (!source) throw new Error("fixture missing source");
    const offer = {
      externalId: "v1",
      merchantId: "shop",
      currency: "USD",
      referenceOnly: false,
      availability: "in_stock" as const,
      retrievedAt: now,
      freshUntil: now,
    };
    const mapped = normalizeProduct(
      {
        source: "shopify",
        externalId: "group",
        upid: "group",
        gtin: "012345678905",
        mpn: "v1",
        title: "Shirt",
        roles: ["shirt"],
        attributes: {},
        offers: [offer, { ...offer, externalId: "v2" }],
        facts: [],
      },
      [apparel],
    );
    expect(mapped.gtin).toBeUndefined();
    expect(mapped.mpn).toBeUndefined();
    expect(mapped.roles).toEqual(["top"]);
    expect(identityKey(mapped)).toBe("upid:group");
    const snapshot = {
      ...source,
      bytes: new Uint8Array([10, 20]),
      cached: false,
    };
    expect(
      JSON.stringify(fromTransient(mapped, snapshot, [apparel])),
    ).not.toContain('"bytes"');
  });
  it.each([
    ["greathub", false, "full"],
    ["shopify", false, "handoff"],
    ["upcitemdb", false, "proof_only"],
    ["greathub", true, "proof_only"],
  ] as const)("resolves %s reference=%s to %s", (source, reference, tier) => {
    expect(checkoutTier(source, reference)).toBe(tier);
  });
});

describe("federated streaming", () => {
  it("emits fast results before a hung source reaches its deadline", async () => {
    let slowSignal: AbortSignal | undefined;
    const stream = searchStream({
      query: "monitor",
      packs,
      timeoutMs: 60,
      now: () => new Date(now),
      providers: [
        {
          source: "slow",
          search: async (_q, _l, signal) => {
            slowSignal = signal;
            return new Promise(() => {});
          },
        },
        { source: "fast", search: async () => ({ products: [product] }) },
      ],
    });
    const reader = stream.getReader();
    const first = JSON.parse(
      new TextDecoder().decode((await reader.read()).value),
    ) as SearchChunk;
    expect(first.source).toBe("fast");
    expect(first.status).toBe("ok");
    expect(slowSignal?.aborted).toBe(false);
    const second = JSON.parse(
      new TextDecoder().decode((await reader.read()).value),
    ) as SearchChunk;
    expect(second).toMatchObject({
      source: "slow",
      status: "timeout",
      products: [],
    });
    expect(slowSignal?.aborted).toBe(true);
    expect((await reader.read()).done).toBe(true);
  });
  it("isolates failures and does not leak error messages", async () => {
    const response = await new Response(
      searchStream({
        query: "x",
        packs,
        providers: [
          {
            source: "failed",
            search: async () => {
              throw new Error("secret credential");
            },
          },
          {
            source: "cached",
            search: async () => ({ products: [], cached: true }),
          },
        ],
      }),
    ).text();
    expect(response).not.toContain("secret credential");
    expect(response).toContain('"status":"error"');
    expect(response).toContain('"status":"cached"');
  });
  it("cancels upstream work when the reader disconnects", async () => {
    const aborted = vi.fn();
    const reader = searchStream({
      query: "x",
      packs,
      providers: [
        {
          source: "slow",
          search: async (_q, _l, signal) => {
            signal.addEventListener("abort", aborted);
            return new Promise(() => {});
          },
        },
      ],
    }).getReader();
    await reader.cancel();
    expect(aborted).toHaveBeenCalledOnce();
  });
});
