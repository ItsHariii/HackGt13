import type {
  Dimension,
  EvidenceState,
  Qualifier,
  Quantity,
  Unit,
} from "@proofcart/contracts";

/** Where a value may come from, in the terms packs use for authority (SDD §11.1). */
export const AUTHORITIES = [
  "merchant_checkout",
  "merchant",
  "manufacturer",
  "catalog",
  "government",
  "user",
  "text",
] as const;
export type Authority = (typeof AUTHORITIES)[number];

/**
 * What kind of value a field holds. Measured fields use their physical
 * dimension and may hold a single quantity, a range or (for length) a box.
 */
export type FieldKind =
  | Dimension
  | "money"
  | "date"
  | "boolean"
  | "enum"
  | "text"
  | "list"
  | "subjective";

export type Duration = `${number}${"s" | "m" | "h" | "d"}`;

export type FieldDef = {
  kind: FieldKind;
  /** Short noun phrase for explanations: "USB-C power", "Desk width". */
  label: string;
  /** Sources that settle a disagreement, strongest first. */
  authority?: readonly Authority[];
  /** How long a fact stays usable after it was fetched (SDD §11.4). */
  freshness?: Duration;
  /** The strongest state this field can ever reach (delivery dates are estimates). */
  maxState?: EvidenceState;
  /** Values within this distance compare as equal (SDD §8.2: dimensions ±0.5 mm). */
  tolerance?: Quantity;
  /** Unit for display and for bare numbers in structured data. */
  unit?: Unit;
  /** Allowed values of an enum field, after alias mapping. */
  values?: readonly string[];
  /** Lowercase spellings mapped onto `values`: `{ "uhd": "4k", "2160p": "4k" }`. */
  aliases?: Readonly<Record<string, string>>;
  /** Caps for qualified values; `approx` caps at `estimated` by default. */
  qualifierCap?: Partial<Record<Qualifier, EvidenceState>>;
};

const DURATION = /^(\d+(?:\.\d+)?)(s|m|h|d)$/;
const UNIT_MS = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 } as const;

export function isDuration(s: string): s is Duration {
  return DURATION.test(s);
}

export function freshnessMs(d: Duration): number {
  const m = DURATION.exec(d);
  if (!m) throw new RangeError(`bad duration: ${d}`);
  return Number(m[1]) * UNIT_MS[m[2] as keyof typeof UNIT_MS];
}

const LENGTH_TOLERANCE: Quantity = { value: 0.5, unit: "mm" };

/**
 * Fields the engine itself defines. Offer fields come from the merchant's
 * checkout (authoritative for price, delivery and terms); basket, merchant
 * and order fields are computed from the lines (SDD §8.2, §11.4).
 */
export const CORE_FIELDS: Readonly<Record<string, FieldDef>> = {
  "offer.price": {
    kind: "money",
    label: "Price",
    authority: ["merchant_checkout"],
    freshness: "60s",
  },
  "offer.delivery_by": {
    kind: "date",
    label: "Delivery date",
    authority: ["merchant_checkout"],
    freshness: "10m",
    maxState: "estimated",
  },
  "offer.final_sale": {
    kind: "boolean",
    label: "Final sale",
    authority: ["merchant_checkout"],
    freshness: "60s",
  },
  "offer.returnable": {
    kind: "boolean",
    label: "Returnable",
    authority: ["merchant_checkout"],
    freshness: "24h",
  },
  "offer.return_window_days": {
    kind: "duration",
    label: "Return window",
    authority: ["merchant_checkout"],
    freshness: "24h",
    unit: "day",
  },
  "offer.return_fee": {
    kind: "money",
    label: "Return fee",
    authority: ["merchant_checkout"],
    freshness: "24h",
  },
  "offer.availability": {
    kind: "enum",
    label: "Availability",
    authority: ["merchant_checkout"],
    freshness: "60s",
    values: ["in_stock", "limited", "out_of_stock", "preorder", "unknown"],
  },
  "offer.seller": {
    kind: "text",
    label: "Seller",
    authority: ["merchant_checkout"],
    freshness: "24h",
  },
  "basket.merchandise_total": { kind: "money", label: "Merchandise total" },
  "basket.shipping_total": { kind: "money", label: "Shipping" },
  "basket.tax_total": { kind: "money", label: "Tax" },
  "basket.delivered_total": { kind: "money", label: "Delivered total" },
  "basket.delivery_latest": {
    kind: "date",
    label: "Latest delivery",
    maxState: "estimated",
  },
  "basket.merchant_count": { kind: "count", label: "Number of stores" },
  "basket.item_count": { kind: "count", label: "Number of items" },
  "basket.missing_roles": { kind: "list", label: "Missing items" },
  "merchant.subtotal": { kind: "money", label: "Store subtotal" },
  "merchant.delivered_total": { kind: "money", label: "Store total" },
  "merchant.delivery_latest": {
    kind: "date",
    label: "Store's latest delivery",
    maxState: "estimated",
  },
  "order.substitutions_allowed": { kind: "boolean", label: "Substitutions" },
};

/** Default tolerance per kind when the field doesn't set one. */
export function defaultTolerance(def: FieldDef): Quantity | undefined {
  return (
    def.tolerance ?? (def.kind === "length" ? LENGTH_TOLERANCE : undefined)
  );
}
