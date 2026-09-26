import type { Fact, Requirement } from "@proofcart/contracts";
import type { ApprovedState, CheckoutState } from "@proofcart/proof-engine";
import { apparel } from "../apparel";
import { approveCheckout } from "./approve";
import { demomartCheckout, demomartOffer, specFact } from "./demomart";

/*
 * "Wedding guest" (SDD §4 S3, §16.1): navy, ≤ $250, arrives by Wed Oct 7,
 * returnable, sizes exchangeable before the Fri Oct 9 event. The Marlow Navy
 * Wrap Dress ($168) can flip to final sale at $118 on the Chaos Panel.
 * Clothing is tax-exempt in the fixture's ship-to state (as in NJ or PA), so
 * the $242 basket stays under budget.
 */

export const WEDDING_BRIEF =
  "I need a navy outfit for a wedding on Friday Oct 9, under $250. It has to arrive by Wednesday and be returnable, so I can still exchange sizes before Friday.";
export const WEDDING_NOW = "2026-09-26T15:00:00Z";
export const WEDDING_PACKS = [apparel];

function stated(quote: string): Requirement["provenance"] {
  const start = WEDDING_BRIEF.indexOf(quote);
  if (start < 0) throw new Error(`quote not in brief: ${quote}`);
  return { kind: "user_stated", quote, span: [start, start + quote.length] };
}

export const WEDDING_REQUIREMENTS: Requirement[] = [
  {
    id: "r_budget",
    scope: "basket",
    field: "basket.delivered_total",
    op: "lte",
    target: { amountMinor: 25_000, currency: "USD" },
    importance: "hard",
    evidence: { minStateToPass: "verified" },
    materiality: "always",
    provenance: stated("under $250"),
  },
  {
    id: "r_arrival",
    scope: "basket",
    field: "basket.delivery_latest",
    op: "lte",
    target: "2026-10-07",
    importance: "hard",
    evidence: { minStateToPass: "estimated" },
    materiality: "on_verdict_change",
    provenance: stated("arrive by Wednesday"),
  },
  {
    id: "r_returnable",
    scope: "item",
    role: "dress",
    field: "offer.final_sale",
    op: "eq",
    target: false,
    importance: "hard",
    evidence: { minStateToPass: "verified" },
    materiality: "on_verdict_change",
    provenance: stated("be returnable"),
  },
  {
    id: "r_exchange",
    scope: "basket",
    field: "basket.exchange_ready_by",
    op: "lte",
    target: "2026-10-09",
    importance: "hard",
    evidence: { minStateToPass: "estimated" },
    materiality: "on_verdict_change",
    provenance: stated("exchange sizes before Friday"),
  },
  {
    id: "r_navy",
    scope: "item",
    role: "dress",
    field: "garment.color",
    op: "eq",
    target: "navy",
    importance: "hard",
    evidence: { minStateToPass: "source_stated" },
    materiality: "on_verdict_change",
    provenance: stated("navy outfit"),
  },
  {
    id: "r_fit",
    scope: "item",
    role: "dress",
    field: "garment.fit_chest",
    op: "between",
    target: {
      min: { value: 35.5, unit: "in" },
      max: { value: 36.5, unit: "in" },
    },
    importance: "hard",
    evidence: { minStateToPass: "estimated" },
    materiality: "on_verdict_change",
    provenance: {
      kind: "user_selected",
      via: "form",
      label: "Fits like my blue dress (36 in chest ± 0.5)",
    },
  },
  {
    id: "r_no_wool",
    scope: "item",
    role: "dress",
    field: "garment.fibers",
    op: "excludes",
    target: ["wool"],
    importance: "preference",
    weight: 0.3,
    evidence: { minStateToPass: "source_stated" },
    materiality: "on_verdict_change",
    provenance: {
      kind: "ai_inferred",
      rationale: "An early-October outdoor wedding runs warm.",
      confirmed: false,
    },
  },
  {
    id: "r_looks",
    scope: "item",
    role: "dress",
    field: "garment.fit_looks",
    op: "exists",
    target: true,
    importance: "hard",
    evidence: { minStateToPass: "source_stated" },
    materiality: "on_verdict_change",
    provenance: { kind: "pack_default", pack: "apparel", ruleId: "fit_looks" },
  },
];

export const MARLOW_WRAP_FACTS: Fact[] = [
  specFact(
    "f_marlow_chest",
    "dm_marlow_wrap_navy",
    "garment.chest",
    { value: 36.5, unit: "in" },
    {
      raw: "Chest (garment, flat × 2): 36.5 in",
    },
  ),
  specFact("f_marlow_color", "dm_marlow_wrap_navy", "garment.color", "navy"),
  specFact("f_marlow_fibers", "dm_marlow_wrap_navy", "garment.fibers", [
    "viscose",
    "elastane",
  ]),
  specFact("f_marlow_viscose", "dm_marlow_wrap_navy", "garment.fiber.viscose", {
    value: 95,
    unit: "pct",
  }),
];

export const ASTER_HEEL_FACTS: Fact[] = [
  specFact("f_aster_heel", "dm_aster_block_heel", "shoes.heel_height", {
    value: 2.5,
    unit: "in",
  }),
  specFact("f_aster_color", "dm_aster_block_heel", "garment.color", "navy"),
];

export type WeddingInit = { now?: string; finalSale?: boolean };

export function weddingCheckout(init: WeddingInit = {}): CheckoutState {
  const flipped = init.finalSale === true;
  const dress = demomartOffer({
    id: "dm_off_marlow_wrap_navy_m",
    productId: "dm_marlow_wrap_navy",
    sku: "MW-WRAP-NVY-M",
    gtin: "00812345001105",
    variant: "Navy / M",
    title: "Marlow Navy Wrap Dress",
    priceMinor: flipped ? 11_800 : 16_800,
    deliveryBy: "2026-10-02",
    terms: flipped
      ? { finalSale: true, returnWindowDays: 0, returnFeeMinor: 0 }
      : { finalSale: false, returnWindowDays: 30, returnFeeMinor: 0 },
  });
  const heels = demomartOffer({
    id: "dm_off_aster_block_heel_8",
    productId: "dm_aster_block_heel",
    sku: "AS-BLOCK-NVY-8",
    gtin: "00812345001204",
    variant: "Navy / 8",
    title: "Aster Block Heel",
    priceMinor: 7_400,
    deliveryBy: "2026-10-02",
  });
  return demomartCheckout(
    [
      { role: "dress", offer: dress, facts: MARLOW_WRAP_FACTS },
      { role: "shoes", offer: heels, facts: ASTER_HEEL_FACTS },
    ],
    { now: init.now ?? WEDDING_NOW, shippingMinor: 0, taxRate: "0" },
  );
}

export function weddingApproved(): Promise<ApprovedState> {
  return approveCheckout({
    contractId: "c_wedding",
    version: 1,
    parentHash: null,
    planId: "p_wedding",
    brief: WEDDING_BRIEF,
    requirements: WEDDING_REQUIREMENTS,
    checkout: weddingCheckout(),
    packs: WEDDING_PACKS,
    now: WEDDING_NOW,
    maxTotalMinor: 25_000,
    waivers: [
      {
        requirementId: "r_looks",
        acceptedState: "unknown",
        reason: "subjective",
      },
    ],
    issuedAt: "2026-09-26T15:00:30Z",
    expiresAt: "2026-09-26T15:15:30Z",
  });
}
