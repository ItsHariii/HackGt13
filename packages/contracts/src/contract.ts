import { z } from "zod";
import { ReturnTerms } from "./catalog";
import {
  Currency,
  Hash,
  HttpUrl,
  IsoDateTime,
  NonNegativeMinor,
  ReasonCode,
  Role,
  SemVer,
} from "./primitives";
import { PackVersions } from "./proof";
import { Requirement } from "./requirement";

export const AutonomyPreset = z.enum(["strict", "balanced", "flexible"]);
export type AutonomyPreset = z.infer<typeof AutonomyPreset>;

/**
 * Ceilings for automatic total increases per preset (SDD §7.6). An increase
 * is auto-accepted only when it is within both the percentage and the amount.
 */
export const AUTONOMY_PRESETS = {
  strict: { increasePct: 0, increaseMinor: 0 },
  balanced: { increasePct: 2, increaseMinor: 500 },
  flexible: { increasePct: 5, increaseMinor: 2000 },
} as const satisfies Record<
  AutonomyPreset,
  { increasePct: number; increaseMinor: number }
>;

/**
 * The user's choice of which changes may proceed without re-approval. It is
 * part of the signed contract. Tolerances may be tightened below the preset
 * but never loosened past it; the policy floor lives in the classifier.
 */
export const AutonomyPolicy = z
  .strictObject({
    preset: AutonomyPreset,
    tolerances: z.strictObject({
      increasePct: z.number().min(0).max(100),
      increaseMinor: NonNegativeMinor,
    }),
  })
  .refine(
    (p) =>
      p.tolerances.increasePct <= AUTONOMY_PRESETS[p.preset].increasePct &&
      p.tolerances.increaseMinor <= AUTONOMY_PRESETS[p.preset].increaseMinor,
    { path: ["tolerances"], message: "tolerances exceed the preset" },
  );
export type AutonomyPolicy = z.infer<typeof AutonomyPolicy>;

export function autonomyPolicy(preset: AutonomyPreset): AutonomyPolicy {
  return { preset, tolerances: { ...AUTONOMY_PRESETS[preset] } };
}

/** What fires a standing mandate (SDD §14). */
export const MandateTrigger = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("price_lte"),
    sku: z.string().min(1),
    amountMinor: NonNegativeMinor,
  }),
  z.strictObject({ type: z.literal("back_in_stock"), sku: z.string().min(1) }),
  z.strictObject({
    type: z.literal("recurring"),
    every: z.string().regex(/^P(?!$)(\d+Y)?(\d+M)?(\d+W)?(\d+D)?$/, {
      message: "expected an ISO 8601 date duration such as P30D",
    }),
  }),
]);
export type MandateTrigger = z.infer<typeof MandateTrigger>;

/** A standing instruction carried inside the signed contract. */
export const Mandate = z.strictObject({
  trigger: MandateTrigger,
  notAfter: IsoDateTime,
});
export type Mandate = z.infer<typeof Mandate>;

export const ContractItem = z.strictObject({
  role: Role,
  merchant: z.string().min(1),
  sellerId: z.string().min(1),
  sku: z.string().min(1),
  gtin: z
    .string()
    .regex(/^\d{8}$|^\d{12,14}$/, "GTIN-8/12/13/14")
    .optional(),
  variant: z.string().min(1).optional(),
  title: z.string().min(1),
  qty: z.number().int().positive(),
  unitPriceMinor: NonNegativeMinor,
  terms: ReturnTerms,
  recurring: z.string().regex(/^P/).optional(),
  /** Digest of the facts this item's verdicts relied on (`factsDigest`). */
  factsDigest: Hash,
});
export type ContractItem = z.infer<typeof ContractItem>;

export const Economics = z
  .strictObject({
    currency: Currency,
    merchandiseMinor: NonNegativeMinor,
    shippingMinor: NonNegativeMinor,
    taxEstimateMinor: NonNegativeMinor,
    maxTotalMinor: NonNegativeMinor,
  })
  .refine(
    (e) =>
      e.merchandiseMinor + e.shippingMinor + e.taxEstimateMinor <=
      e.maxTotalMinor,
    {
      path: ["maxTotalMinor"],
      message: "max total is below the approved total",
    },
  );
export type Economics = z.infer<typeof Economics>;

export const Waiver = z.strictObject({
  requirementId: z.string().min(1),
  /** Only an `unknown` can be waived; a hard `fail` must be edited instead. */
  acceptedState: z.literal("unknown"),
  reason: ReasonCode,
});
export type Waiver = z.infer<typeof Waiver>;

export const CONTRACT_SCHEMA = "cartel.contract/1";

/**
 * The canonical statement of what the user authorizes (SDD §12.1). Its JCS
 * hash is what the passkey signs, so unknown keys are rejected rather than
 * silently stripped.
 */
export const ContractBody = z
  .strictObject({
    schema: z.literal(CONTRACT_SCHEMA),
    contractId: z.string().min(1),
    version: z.number().int().positive(),
    parentHash: Hash.nullable(),
    planId: z.string().min(1),
    subject: z.string().regex(/^user:[0-9a-f-]{36}$/, "expected user:<uuid>"),
    intent: z.strictObject({
      text: z.string().min(1),
      requirementSetHash: Hash,
    }),
    requirements: z.array(Requirement).min(1),
    items: z.array(ContractItem).min(1),
    economics: Economics,
    merchants: z
      .array(z.strictObject({ id: z.string().min(1), origin: HttpUrl }))
      .min(1),
    autonomy: AutonomyPolicy,
    waivers: z.array(Waiver),
    mandate: Mandate.nullable(),
    proof: z.strictObject({
      reportHash: Hash,
      engineVersion: SemVer,
      packs: PackVersions,
    }),
    issuedAt: IsoDateTime,
    expiresAt: IsoDateTime,
  })
  .superRefine((c, ctx) => {
    if ((c.version === 1) !== (c.parentHash === null)) {
      ctx.addIssue({
        code: "custom",
        path: ["parentHash"],
        message: "only version 1 has no parent",
      });
    }
    if (Date.parse(c.expiresAt) <= Date.parse(c.issuedAt)) {
      ctx.addIssue({
        code: "custom",
        path: ["expiresAt"],
        message: "expires before it is issued",
      });
    }
    if (c.mandate && Date.parse(c.mandate.notAfter) > Date.parse(c.expiresAt)) {
      ctx.addIssue({
        code: "custom",
        path: ["mandate", "notAfter"],
        message: "mandate outlives the contract",
      });
    }
    const merchantIds = new Set(c.merchants.map((m) => m.id));
    c.items.forEach((item, i) => {
      if (!merchantIds.has(item.merchant)) {
        ctx.addIssue({
          code: "custom",
          path: ["items", i, "merchant"],
          message: `merchant ${item.merchant} is not listed in merchants`,
        });
      }
    });
    const merchandise = c.items.reduce(
      (sum, item) => sum + item.unitPriceMinor * item.qty,
      0,
    );
    if (merchandise !== c.economics.merchandiseMinor) {
      ctx.addIssue({
        code: "custom",
        path: ["economics", "merchandiseMinor"],
        message: `items sum to ${merchandise}`,
      });
    }
    const requirementIds = new Set(c.requirements.map((r) => r.id));
    if (requirementIds.size !== c.requirements.length) {
      ctx.addIssue({
        code: "custom",
        path: ["requirements"],
        message: "duplicate requirement id",
      });
    }
    c.waivers.forEach((w, i) => {
      if (!requirementIds.has(w.requirementId)) {
        ctx.addIssue({
          code: "custom",
          path: ["waivers", i, "requirementId"],
          message: "waiver for an unknown requirement",
        });
      }
    });
  });
export type ContractBody = z.infer<typeof ContractBody>;

const Base64Url = z.string().regex(/^[A-Za-z0-9_-]+$/, "expected base64url");

/**
 * A stored WebAuthn assertion over a contract, with the public key so anyone
 * can re-verify it offline (SDD §12.2).
 */
export const ContractSignature = z.strictObject({
  bodyHash: Hash,
  credentialId: Base64Url,
  authenticatorData: Base64Url,
  clientDataJSON: Base64Url,
  signature: Base64Url,
  publicKeyJwk: z.record(z.string(), z.unknown()),
  signedAt: IsoDateTime,
});
export type ContractSignature = z.infer<typeof ContractSignature>;

/** The WebAuthn challenge string that binds a signature to a body hash. */
export function signingChallenge(bodyHash: Hash, nonce: string): string {
  return `ct1:${bodyHash.slice("sha256:".length)}:${nonce}`;
}

/** Longest lifetime of a scoped payment grant, in seconds (SDD §13.2). */
export const GRANT_MAX_LIFETIME_S = 600;

const NumericDate = z.number().int().positive();

/**
 * JWS claims of the grant Cartel mints for one guarded execution. The
 * merchant verifies it against Cartel's JWKS before charging.
 */
export const ScopedPaymentGrant = z
  .strictObject({
    iss: HttpUrl,
    /** The merchant's origin. */
    aud: HttpUrl,
    sub: z.string().regex(/^user:[0-9a-f-]{36}$/),
    /** Grant ID; also sent to the rail as merchant-defined data. */
    jti: z.string().min(1),
    iat: NumericDate,
    exp: NumericDate,
    merchantId: z.string().min(1),
    contractId: z.string().min(1),
    contractVersion: z.number().int().positive(),
    contractHash: Hash,
    executionId: z.uuid(),
    maxTotalMinor: NonNegativeMinor,
    currency: Currency,
    instrumentRef: z.string().min(1),
  })
  .refine((g) => g.exp > g.iat && g.exp - g.iat <= GRANT_MAX_LIFETIME_S, {
    path: ["exp"],
    message: `grant must expire within ${GRANT_MAX_LIFETIME_S}s`,
  });
export type ScopedPaymentGrant = z.infer<typeof ScopedPaymentGrant>;
