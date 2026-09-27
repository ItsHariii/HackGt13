import type { Requirement } from "@cartel/contracts";
import {
  normalizeUcpProduct,
  type ShopifyResult,
  type Snapshot,
  type UcpProduct,
} from "@cartel/evidence";
import type { UcpCheckout } from "@cartel/payments";
import { consentDiff } from "@cartel/proof-engine";
import { approveCheckout } from "@cartel/rule-packs/fixtures";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { catalogListsStore, shopifyCheckoutState } = await import(
  "./shopify-state"
);
const { ALL_PACKS } = await import("./evidence");

const T0 = "2026-09-27T10:00:00.000Z";
const T1 = "2026-09-27T10:20:00.000Z";
const VARIANT = "gid://shopify/v/1";

const LAMP: UcpProduct = {
  id: "gid://shopify/p/lamp",
  title: "Brass Desk Lamp",
  url: "https://harbor.example/products/brass-desk-lamp",
  price_range: {
    min: { amount: 6800, currency: "USD" },
    max: { amount: 6800, currency: "USD" },
  },
  variants: [
    {
      id: VARIANT,
      title: "Brass",
      price: { amount: 6800, currency: "USD" },
      availability: { available: true, status: "in_stock" },
    },
  ],
};

function catalog(at: string): ShopifyResult {
  return {
    source: {
      id: `src_catalog_${at}`,
      fetchedAt: at,
      sourceType: "shopify_ucp",
    } as Snapshot,
    products: [normalizeUcpProduct(LAMP, at)],
  };
}

function checkout(totalMinor = 7_776): UcpCheckout {
  return {
    id: "chk_1",
    currency: "USD",
    status: "ready_for_complete",
    continue_url: "https://harbor.example/checkouts/chk_1",
    line_items: [
      {
        id: "li_1",
        quantity: 1,
        item: { id: VARIANT, price: 6_800 },
        totals: [{ type: "subtotal", amount: 6_800 }],
      },
    ],
    totals: [
      { type: "subtotal", amount: 6_800 },
      { type: "fulfillment", amount: 500 },
      { type: "tax", amount: totalMinor - 7_300 },
      { type: "total", amount: totalMinor },
    ],
  };
}

const BUDGET: Requirement = {
  id: "r_budget",
  scope: "basket",
  field: "basket.delivered_total",
  op: "lte",
  target: { amountMinor: 9_000, currency: "USD" },
  importance: "hard",
  evidence: { minStateToPass: "verified" },
  materiality: "always",
  provenance: { kind: "user_selected", via: "form", label: "Maximum total" },
};
const SCOPE = {
  planId: "plan_1",
  merchantId: "harbor.example",
  items: [{ role: "item", sku: VARIANT }],
};

describe("shopifyCheckoutState", () => {
  it("takes prices and totals from the store's checkout and proves the maximum", async () => {
    const state = shopifyCheckoutState(
      SCOPE,
      checkout(),
      catalog(T0),
      T0,
      "s0",
    );
    expect(state.offers[0]).toMatchObject({
      sku: VARIANT,
      tier: "handoff",
      price: { amountMinor: 6_800, currency: "USD" },
      terms: { finalSale: true, returnWindowDays: 0, returnFeeMinor: 0 },
    });
    expect(state.quotes?.[0]?.total?.amountMinor).toBe(7_776);
    const approved = await approveCheckout({
      contractId: "c_1",
      version: 1,
      parentHash: null,
      planId: "plan_1",
      brief: "Buy the lamp.",
      requirements: [BUDGET],
      checkout: state,
      packs: ALL_PACKS,
      now: T0,
      maxTotalMinor: 9_000,
      issuedAt: T0,
      expiresAt: "2026-09-28T10:00:00.000Z",
    });
    expect(approved.report.summary.hard.pass).toBe(1);

    // The hand-off re-check builds the same state from a fresh read: nothing changed.
    const later = shopifyCheckoutState(
      SCOPE,
      checkout(),
      catalog(T1),
      T1,
      "s1",
    );
    const same = await consentDiff(approved, later, ALL_PACKS, T1);
    expect(["identical", "auto"]).toContain(same.diff.classification);

    // A total over the signed maximum never goes through.
    const pricier = shopifyCheckoutState(
      SCOPE,
      checkout(9_500),
      catalog(T1),
      T1,
      "s2",
    );
    const over = await consentDiff(approved, pricier, ALL_PACKS, T1);
    expect(["reapprove", "block"]).toContain(over.diff.classification);
  });
});

describe("catalogListsStore", () => {
  it("accepts only the store the catalog lists for every item", () => {
    const read = catalog(T0);
    expect(
      catalogListsStore(read, [{ sku: VARIANT }], "https://harbor.example"),
    ).toBe(true);
    expect(
      catalogListsStore(read, [{ sku: VARIANT }], "https://evil.example"),
    ).toBe(false);
    expect(
      catalogListsStore(
        read,
        [{ sku: "gid://other" }],
        "https://harbor.example",
      ),
    ).toBe(false);
  });
});
