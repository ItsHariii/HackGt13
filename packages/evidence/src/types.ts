import type { EvidenceState, ReasonCode, Value } from "@cartel/contracts";
import type { Authority } from "@cartel/proof-engine";

/** `sources.source_type` values (supabase/migrations/0002_catalog.sql). */
export const SOURCE_TYPES = [
  "acp_checkout",
  "json_ld",
  "merchant_api",
  "shopify_ucp",
  "upcitemdb",
  "icecat",
  "cpsc",
  "openfoodfacts",
  "ebay",
  "fixture",
  "user_input",
  "unstructured",
] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

/**
 * The authority each kind of source speaks with (SDD §11.1). Packs name
 * authorities, not source types, when they settle a disagreement.
 */
export const SOURCE_AUTHORITY: Readonly<Record<SourceType, Authority>> = {
  acp_checkout: "merchant_checkout",
  json_ld: "merchant",
  merchant_api: "merchant",
  shopify_ucp: "catalog",
  upcitemdb: "catalog",
  icecat: "manufacturer",
  cpsc: "government",
  openfoodfacts: "catalog",
  ebay: "catalog",
  // Seeded spec sheets stand in for the manufacturer and say so in provenance (SDD §11.2).
  fixture: "manufacturer",
  user_input: "user",
  unstructured: "text",
};

/** One stored fetch: a `sources` row whose bytes live in Storage (SDD §11.3). */
export type SourceRecord = {
  id: string;
  url: string;
  sourceType: SourceType;
  /** `sha256:<hex>` of the raw bytes. */
  contentHash: string;
  contentType: string | null;
  /** Object path in the `sources` bucket: `{hex}.{ext}`. */
  storagePath: string | null;
  httpStatus: number | null;
  fetchedAt: string;
};

export type SubjectKind = "product" | "offer";

/**
 * A fact ready to store. The database assigns the ID; `planFactWrites`
 * decides what it supersedes and whether it conflicts.
 */
export type FactDraft = {
  subjectKind: SubjectKind;
  subjectId: string;
  field: string;
  value: Value | null;
  raw?: string;
  state: EvidenceState;
  /** Why the state is `unknown`, when it is. */
  reason?: ReasonCode;
  sourceId: string;
  quote?: string;
  /** Character offsets of `quote` in the snapshot text, end exclusive. */
  span?: [number, number];
  /** Which reader produced it: `jsonld`, `checkout`, `icecat`, `llm:fast@A3`, … */
  extractor: string;
  retrievedAt: string;
  freshUntil?: string;
};

/** A fact as stored: a draft plus its row identity and conflict flag. */
export type StoredFact = FactDraft & {
  id: string;
  conflict: boolean;
};

/**
 * A fact an adapter read before the product or offer it describes has a
 * row. `offerKey` names the offer by its external ID; absent means the product.
 */
export type ClaimedFact = {
  offerKey?: string;
  field: string;
  value: Value | null;
  raw?: string;
  state: EvidenceState;
  reason?: ReasonCode;
  quote?: string;
  span?: [number, number];
  extractor: string;
  freshUntil?: string;
};

export type Availability =
  | "in_stock"
  | "limited"
  | "backorder"
  | "preorder"
  | "out_of_stock"
  | "discontinued"
  | "unknown";

/** A product as one source describes it, before identity resolution (SDD §11.5). */
export type NormalizedProduct = {
  source: "shopify" | "upcitemdb" | "icecat" | "greathub" | "openfoodfacts";
  externalId: string;
  title: string;
  brand?: string;
  /** Always GTIN-14 with a valid check digit. */
  gtin?: string;
  mpn?: string;
  upid?: string;
  category?: string;
  roles: string[];
  imageUrl?: string;
  url?: string;
  /** Source attributes with no pack field. Shown, never fed to a rule. */
  attributes: Record<string, string>;
  offers: NormalizedOffer[];
  facts: ClaimedFact[];
};

export type NormalizedOffer = {
  externalId: string;
  merchantId: string;
  sellerId?: string;
  title?: string;
  priceMinor?: number;
  currency: string;
  shippingMinor?: number;
  availability: Availability;
  url?: string;
  /** Historical listings: shown as "last seen", never used for price rules. */
  referenceOnly: boolean;
  retrievedAt: string;
  freshUntil: string;
};
