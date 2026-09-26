import type { Fact } from "../catalog";
import {
  autonomyPolicy,
  type ContractBody,
  type ContractSignature,
} from "../contract";
import type { Requirement } from "../requirement";

/*
 * The canonical flagship demo (SDD §16.1): the home-office brief, its
 * requirements, and contract v8 (Halden replaces the deal-trapped Vireo,
 * webcam at $45). Seed data, mockups and the demo script use these numbers.
 * Hash literals are pinned by fixtures.test.ts; recompute them there if the
 * data changes.
 */

export const FLAGSHIP_BRIEF =
  "Build my home office for under $1,000. The desk has to fit a 48-inch alcove, I want a 27-inch 4K monitor that charges my MacBook over one USB-C cable, and everything has to arrive by Monday. Don't substitute anything without asking.";

function stated(quote: string): Requirement["provenance"] {
  const start = FLAGSHIP_BRIEF.indexOf(quote);
  if (start < 0) throw new Error(`quote not in brief: ${quote}`);
  return { kind: "user_stated", quote, span: [start, start + quote.length] };
}

export const FLAGSHIP_REQUIREMENTS: Requirement[] = [
  {
    id: "r_budget",
    scope: "basket",
    field: "basket.delivered_total",
    op: "lte",
    target: { amountMinor: 100_000, currency: "USD" },
    importance: "hard",
    evidence: { minStateToPass: "verified" },
    materiality: "always",
    provenance: stated("under $1,000"),
  },
  {
    id: "r_desk_width",
    scope: "item",
    role: "desk",
    field: "desk.width",
    op: "lte",
    target: { value: 48, unit: "in" },
    importance: "hard",
    evidence: { minStateToPass: "source_stated" },
    materiality: "on_verdict_change",
    provenance: stated("fit a 48-inch alcove"),
  },
  {
    id: "r_monitor_size",
    scope: "item",
    role: "monitor",
    field: "monitor.diagonal",
    op: "eq",
    target: { value: 27, unit: "in" },
    importance: "hard",
    evidence: { minStateToPass: "source_stated" },
    materiality: "on_verdict_change",
    provenance: stated("27-inch 4K monitor"),
  },
  {
    id: "r_monitor_4k",
    scope: "item",
    role: "monitor",
    field: "monitor.resolution",
    op: "eq",
    target: "4k",
    importance: "hard",
    evidence: { minStateToPass: "source_stated" },
    materiality: "on_verdict_change",
    provenance: stated("27-inch 4K monitor"),
  },
  {
    id: "r_usb_pd",
    scope: "item",
    role: "monitor",
    field: "monitor.usb_c_pd_watts",
    op: "gte",
    target: { value: 65, unit: "W" },
    importance: "hard",
    evidence: { minStateToPass: "source_stated" },
    materiality: "on_verdict_change",
    provenance: {
      kind: "ai_inferred",
      rationale:
        'From "charges my MacBook over one USB-C cable": a MacBook needs at least 65 W over USB-C.',
      confirmed: true,
    },
  },
  {
    id: "r_cable_pd",
    scope: "item",
    role: "cable",
    field: "cable.usb_pd_watts",
    op: "gte",
    target: { value: 65, unit: "W" },
    importance: "hard",
    evidence: { minStateToPass: "source_stated" },
    materiality: "on_verdict_change",
    provenance: {
      kind: "pack_default",
      pack: "home-office",
      ruleId: "cable_pd",
    },
  },
  {
    id: "r_delivery",
    scope: "basket",
    field: "basket.delivery_latest",
    op: "lte",
    target: "2026-09-28",
    importance: "hard",
    evidence: { minStateToPass: "estimated" },
    materiality: "on_verdict_change",
    provenance: stated("arrive by Monday"),
  },
  {
    id: "r_no_substitutions",
    scope: "order",
    field: "order.substitutions_allowed",
    op: "eq",
    target: false,
    importance: "hard",
    evidence: { minStateToPass: "verified" },
    materiality: "always",
    provenance: stated("Don't substitute anything without asking"),
  },
  {
    id: "r_chair_lumbar",
    scope: "item",
    role: "chair",
    field: "chair.adjustable_lumbar",
    op: "eq",
    target: true,
    importance: "preference",
    weight: 0.5,
    evidence: { minStateToPass: "source_stated" },
    materiality: "on_verdict_change",
    provenance: {
      kind: "ai_inferred",
      rationale: "Long desk sessions usually call for lumbar support.",
      confirmed: false,
    },
  },
  {
    id: "r_chair_comfort",
    scope: "item",
    role: "chair",
    field: "chair.comfort",
    op: "exists",
    target: true,
    importance: "hard",
    evidence: { minStateToPass: "source_stated" },
    materiality: "on_verdict_change",
    provenance: {
      kind: "pack_default",
      pack: "home-office",
      ruleId: "chair_comfort",
    },
  },
];

const RETRIEVED = "2026-09-26T14:02:05Z";

function fact(
  id: string,
  subjectId: string,
  field: string,
  value: Fact["value"],
  extra: Partial<Fact> = {},
): Fact {
  return {
    id,
    subjectKind: "product",
    subjectId,
    field,
    value,
    state: "source_stated",
    conflict: false,
    sourceId: `src_${subjectId}_jsonld`,
    extractor: "jsonld",
    retrievedAt: RETRIEVED,
    ...extra,
  };
}

/** Facts each v8 item's verdicts relied on, keyed by role. */
export const FLAGSHIP_V8_FACTS: Record<string, Fact[]> = {
  desk: [
    fact("f_desk_w", "dm_birchline_465", "desk.width", {
      value: 46.5,
      unit: "in",
    }),
  ],
  chair: [
    fact("f_chair_lumbar", "dm_kestrel_mesh", "chair.adjustable_lumbar", true),
    fact("f_chair_comfort", "dm_kestrel_mesh", "chair.comfort", null, {
      state: "unknown",
      reason: "subjective",
    }),
  ],
  monitor: [
    fact("f_halden_diag", "dm_halden_m27q", "monitor.diagonal", {
      value: 27,
      unit: "in",
    }),
    fact("f_halden_res", "dm_halden_m27q", "monitor.resolution", "4k"),
    fact(
      "f_halden_pd",
      "dm_halden_m27q",
      "monitor.usb_c_pd_watts",
      { value: 65, unit: "W" },
      {
        raw: "USB-C (DP Alt Mode, 65W PD)",
      },
    ),
  ],
  cable: [
    fact("f_loop_pd", "dm_loop_100w_2m", "cable.usb_pd_watts", {
      value: 100,
      unit: "W",
    }),
  ],
  webcam: [fact("f_pica_res", "dm_pica_1080", "webcam.resolution", "1080p")],
};

/** The Vireo U2727 as approved in v7 … */
export const VIREO_U2727_FACTS: Fact[] = [
  fact("f_vireo_diag", "dm_vireo_u2727", "monitor.diagonal", {
    value: 27,
    unit: "in",
  }),
  fact("f_vireo_res", "dm_vireo_u2727", "monitor.resolution", "4k"),
  fact(
    "f_vireo_pd",
    "dm_vireo_u2727",
    "monitor.usb_c_pd_watts",
    { value: 90, unit: "W", qualifier: "up_to" },
    { raw: "USB-C power delivery up to 90 W" },
  ),
];

/** … and after the Chaos Panel deal trap edits the same SKU (SDD §16.1 event 2). */
export const VIREO_U2727_DEAL_TRAP_FACTS: Fact[] = VIREO_U2727_FACTS.map((f) =>
  f.field === "monitor.usb_c_pd_watts"
    ? {
        ...f,
        id: "f_vireo_pd_2",
        value: { value: 15, unit: "W" },
        raw: "USB-C power delivery 15 W",
        retrievedAt: "2026-09-26T14:10:00Z",
      }
    : f,
);

const TERMS_30 = { finalSale: false, returnWindowDays: 30, returnFeeMinor: 0 };

export const FLAGSHIP_CONTRACT_V8: ContractBody = {
  schema: "proofcart.contract/1",
  contractId: "c_flagship",
  version: 8,
  // v7 is modeled by flagshipV7() in @proofcart/rule-packs/fixtures, whose
  // tests recompute this hash.
  parentHash:
    "sha256:2c0ab399589eee3511b0b53ab5fe3284a3759280436a667c7830f0b943da9ecc",
  planId: "p_flagship",
  subject: "user:5f0c7a52-3b8e-4d61-9a2f-1c6e8b4d7a90",
  intent: {
    text: FLAGSHIP_BRIEF,
    requirementSetHash:
      "sha256:5f6ce8129f16fc836bcb4070c93da0bb02a148fa8fcfb1b84a016e7b281941d6",
  },
  requirements: FLAGSHIP_REQUIREMENTS,
  items: [
    {
      role: "desk",
      merchant: "demomart",
      sellerId: "dm_seller_1",
      sku: "BL-CD-465",
      gtin: "00812345000108",
      title: 'Birchline Compact Desk 46.5"',
      qty: 1,
      unitPriceMinor: 22_900,
      terms: TERMS_30,
      factsDigest:
        "sha256:0f0a99f89e7d0cf51c7e855ce83c8c2b74d6df3dd61618c93c086c8a7066096a",
    },
    {
      role: "chair",
      merchant: "demomart",
      sellerId: "dm_seller_1",
      sku: "KS-MESH-TASK",
      gtin: "00812345000207",
      title: "Kestrel Mesh Task Chair",
      qty: 1,
      unitPriceMinor: 18_900,
      terms: TERMS_30,
      factsDigest:
        "sha256:721248a34997db298df7b7442ebd1d44a847362773acb6853b4cbefaec192c6a",
    },
    {
      role: "monitor",
      merchant: "demomart",
      sellerId: "dm_seller_1",
      sku: "M27Q-USBC",
      gtin: "00812345000016",
      title: 'Halden M27Q-USBC 27" 4K USB-C Monitor',
      qty: 1,
      unitPriceMinor: 30_900,
      terms: TERMS_30,
      factsDigest:
        "sha256:8b98d2772cd9965992bf9675cf413828f6b301bf8652ae1659738563ca4428c8",
    },
    {
      role: "cable",
      merchant: "demomart",
      sellerId: "dm_seller_1",
      sku: "LOOP-C100-2M",
      gtin: "00812345000405",
      title: "Loop USB-C Cable 100 W, 2 m",
      qty: 1,
      unitPriceMinor: 1_900,
      terms: TERMS_30,
      factsDigest:
        "sha256:ec1d0b6f01764ad24825982de22f86498903104f4eb7fbed5d8906482171f69a",
    },
    {
      role: "webcam",
      merchant: "demomart",
      sellerId: "dm_seller_1",
      sku: "PICA-1080",
      gtin: "00812345000504",
      title: "Pica 1080p Webcam",
      qty: 1,
      unitPriceMinor: 4_500,
      terms: TERMS_30,
      factsDigest:
        "sha256:5c32ee040ebe6d259e35d80db08319c6fba8909320eee7118dc6979b3292cd28",
    },
  ],
  economics: {
    currency: "USD",
    merchandiseMinor: 79_100,
    shippingMinor: 2_400,
    taxEstimateMinor: 5_537,
    maxTotalMinor: 88_500,
  },
  merchants: [{ id: "demomart", origin: "https://demomart.example" }],
  autonomy: autonomyPolicy("balanced"),
  waivers: [
    {
      requirementId: "r_chair_comfort",
      acceptedState: "unknown",
      reason: "subjective",
    },
  ],
  mandate: null,
  proof: {
    // The proof-engine report for flagshipV8() in @proofcart/rule-packs/fixtures.
    reportHash:
      "sha256:4106fdcae4ee25cba45493b4f61049c146c6e4a1975b8e0fb55c63f3d0846bde",
    engineVersion: "1.0.0",
    packs: { "home-office": "1.0.0" },
  },
  // Signed after the deal trap (14:10) blocked v7.
  issuedAt: "2026-09-26T14:12:30Z",
  expiresAt: "2026-09-26T14:27:30Z",
};

/**
 * Shape-only stand-in for a stored assertion. The byte fields are not a
 * real WebAuthn signature; signing tests generate their own.
 */
export const FLAGSHIP_V8_SIGNATURE: ContractSignature = {
  bodyHash:
    "sha256:3826b2bc790fdcc1bb09442808dca5f2af4211ba23282167519489de52458474",
  credentialId: "Zml4dHVyZS1jcmVkZW50aWFs",
  authenticatorData: "Zml4dHVyZS1hdXRoZW50aWNhdG9yLWRhdGE",
  clientDataJSON: "Zml4dHVyZS1jbGllbnQtZGF0YQ",
  signature: "Zml4dHVyZS1zaWduYXR1cmU",
  publicKeyJwk: { kty: "EC", crv: "P-256", x: "fixture", y: "fixture" },
  signedAt: "2026-09-26T14:12:50Z",
};
