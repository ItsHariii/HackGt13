import { z } from "zod";
import {
  EvidenceState,
  FieldRef,
  HttpUrl,
  IsoDate,
  IsoDateTime,
  Money,
  ReasonCode,
  Role,
  Value,
} from "./primitives";
import { TextSpan } from "./requirement";

/**
 * A normalized value for one field of a product or offer, with its evidence
 * state and provenance (SDD §7.1, §19.2).
 */
export const Fact = z
  .strictObject({
    id: z.string().min(1),
    subjectKind: z.enum(["product", "offer"]),
    subjectId: z.string().min(1),
    field: FieldRef,
    value: Value.nullable(),
    /** Source text before parsing, when there was any. */
    raw: z.string().optional(),
    state: EvidenceState,
    /** Set when sources disagree; kept even after authority resolves it. */
    conflict: z.boolean(),
    /** Why the state is `unknown`, when it is. */
    reason: ReasonCode.optional(),
    sourceId: z.string().min(1),
    /** Verbatim quote, verified to occur in the source snapshot (SDD §10.2). */
    quote: z.string().min(1).optional(),
    span: TextSpan.optional(),
    /** e.g. `jsonld`, `icecat`, `llm:fast@A3`, `derive:wh_from_mah`. */
    extractor: z.string().min(1),
    /** Inputs and assumptions of a derived fact; caps state (SDD §7.3). */
    derivation: z
      .strictObject({
        inputs: z.array(z.string().min(1)).min(1),
        assumptions: z.array(z.string().min(1)),
      })
      .optional(),
    retrievedAt: IsoDateTime,
    freshUntil: IsoDateTime.optional(),
  })
  .superRefine((f, ctx) => {
    if (f.quote !== undefined && f.span === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["span"],
        message: "a quoted fact must record where the quote was found",
      });
    }
    if (f.value === null && f.state !== "unknown") {
      ctx.addIssue({
        code: "custom",
        path: ["state"],
        message: "a fact without a value can only be unknown",
      });
    }
    if (
      f.derivation &&
      f.derivation.assumptions.length > 0 &&
      (f.state === "verified" ||
        f.state === "source_stated" ||
        f.state === "supported")
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["state"],
        message: "a fact derived with an assumption is capped at estimated",
      });
    }
  });
export type Fact = z.infer<typeof Fact>;

export const ReturnTerms = z.strictObject({
  finalSale: z.boolean(),
  /** Days after delivery; 0 when final sale. */
  returnWindowDays: z.number().int().nonnegative(),
  returnFeeMinor: z.number().int().nonnegative(),
});
export type ReturnTerms = z.infer<typeof ReturnTerms>;

/** Which checkout path applies (SDD §13.7). */
export const CheckoutTier = z.enum(["full", "handoff", "proof_only"]);
export type CheckoutTier = z.infer<typeof CheckoutTier>;

export const Availability = z.enum([
  "in_stock",
  "limited",
  "out_of_stock",
  "preorder",
  "unknown",
]);

/** A merchant's current offer for one product variant. */
export const Offer = z.strictObject({
  id: z.string().min(1),
  productId: z.string().min(1),
  merchant: z.string().min(1),
  sellerId: z.string().min(1),
  sku: z.string().min(1),
  gtin: z
    .string()
    .regex(/^\d{8}$|^\d{12,14}$/, "GTIN-8/12/13/14")
    .optional(),
  variant: z.string().min(1).optional(),
  title: z.string().min(1),
  price: Money,
  shipping: Money.optional(),
  availability: Availability,
  deliveryBy: IsoDate.optional(),
  terms: ReturnTerms,
  /** ISO 8601 duration when the offer is a subscription, e.g. `P30D`. */
  recurring: z.string().regex(/^P/).optional(),
  tier: CheckoutTier,
  url: HttpUrl.optional(),
});
export type Offer = z.infer<typeof Offer>;

export const BasketLine = z.strictObject({
  role: Role,
  offerId: z.string().min(1),
  qty: z.number().int().positive(),
});
export type BasketLine = z.infer<typeof BasketLine>;

/** A selection of offers per role (Plans A, B and C are baskets). */
export const Basket = z
  .strictObject({
    id: z.string().min(1),
    label: z.string().min(1).optional(),
    lines: z.array(BasketLine).min(1),
  })
  .refine(
    (b) =>
      new Set(b.lines.map((l) => `${l.role}\u0000${l.offerId}`)).size ===
      b.lines.length,
    { message: "duplicate role/offer line; use qty instead" },
  );
export type Basket = z.infer<typeof Basket>;
