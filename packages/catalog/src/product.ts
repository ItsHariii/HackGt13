import type {
  CheckoutTier,
  Fact,
  Offer,
  ProofResult,
  Requirement,
} from "@proofcart/contracts";
import {
  type NormalizedProduct,
  SOURCE_AUTHORITY,
  type SourceRecord,
  toDrafts,
} from "@proofcart/evidence";
import {
  evaluateResults,
  fieldDef,
  type Pack,
  resolveFacts,
  type SourceInfo,
} from "@proofcart/proof-engine";
import { identityKey } from "./normalize";

export type CatalogOffer = {
  id: string;
  source: string;
  externalId: string;
  merchant: string;
  sellerId: string | null;
  priceMinor: number | null;
  currency: string;
  shippingMinor: number | null;
  availability: string;
  referenceOnly: boolean;
  retrievedAt: string;
  freshUntil: string;
  url: string | null;
  tier: CheckoutTier;
};
export type CatalogProduct = {
  id: string;
  identityKey: string;
  title: string;
  brand: string | null;
  gtin: string | null;
  mpn: string | null;
  upid: string | null;
  category: string | null;
  roles: string[];
  imageUrl: string | null;
  attributes: Record<string, unknown>;
  refs: { source: string; externalId: string; url: string | null }[];
  offers: CatalogOffer[];
  facts: Fact[];
  sources: SourceRecord[];
  rank: number;
  proof: ProofResult[];
};

export function checkoutTier(
  source: string,
  referenceOnly = false,
): CheckoutTier {
  return referenceOnly
    ? "proof_only"
    : source === "demomart"
      ? "full"
      : source === "shopify"
        ? "handoff"
        : "proof_only";
}

export function sourceInfo(
  sources: readonly SourceRecord[],
): Record<string, SourceInfo> {
  return Object.fromEntries(
    sources.map((s) => [
      s.id,
      { authority: SOURCE_AUTHORITY[s.sourceType], name: s.url },
    ]),
  );
}

/** Only item rules for roles this product can fill. No basket/order readiness is implied. */
export function productProof(
  product: CatalogProduct,
  requirements: readonly Requirement[],
  packs: readonly Pack[],
  now: string,
): ProofResult[] {
  const relevant = requirements.filter(
    (r) => r.scope === "item" && product.roles.includes(r.role ?? ""),
  );
  if (!relevant.length) return [];
  // Offer envelope satisfies the engine's input shape. Prices/terms are NEVER facts:
  // buildView resolves item fields exclusively from evidence (and pack derivations).
  const offers: Offer[] = (product.offers.length ? product.offers : [null]).map(
    (o) => ({
      id: o?.id ?? `spec:${product.id}`,
      productId: product.id,
      merchant: o?.merchant ?? "specification",
      sellerId: o?.sellerId ?? o?.merchant ?? "unknown",
      sku: o?.externalId ?? product.id,
      title: product.title,
      price: { amountMinor: 0, currency: o?.currency ?? "USD" },
      availability: "unknown",
      terms: { finalSale: true, returnWindowDays: 0, returnFeeMinor: 0 },
      tier: o?.tier ?? "proof_only",
    }),
  );
  const references = new Set(
    product.offers.filter((o) => o.referenceOnly).map((o) => o.id),
  );
  const facts = product.facts.filter(
    (f) =>
      fieldDef(f.field, packs) &&
      !(
        f.field.startsWith("offer.") &&
        (f.subjectKind !== "offer" || references.has(f.subjectId))
      ),
  );
  return evaluateResults({
    requirements: relevant,
    offers,
    facts,
    packs,
    now,
    sources: sourceInfo(product.sources),
    basket: {
      id: `preview:${product.id}`,
      lines: [...new Set(relevant.map((r) => r.role as string))].flatMap(
        (role) => offers.map((o) => ({ role, offerId: o.id, qty: 1 })),
      ),
    },
  });
}

export function rankProducts(
  products: CatalogProduct[],
  requirements: readonly Requirement[],
  packs: readonly Pack[],
  now: string,
): CatalogProduct[] {
  return products
    .map((p) => {
      const proof = productProof(p, requirements, packs, now);
      const perOffer = new Map<string, Set<string>>();
      for (const result of proof) {
        if (
          result.scope.kind !== "item" ||
          result.importance !== "hard" ||
          result.verdict !== "pass"
        )
          continue;
        const key = result.scope.offerId ?? "spec";
        const rules = perOffer.get(key) ?? new Set<string>();
        rules.add(result.requirementId);
        perOffer.set(key, rules);
      }
      const passed = Math.max(
        0,
        ...[...perOffer.values()].map((rules) => rules.size),
      );
      return { ...p, proof, rank: p.rank + passed * 2 };
    })
    .sort(
      (a, b) =>
        b.rank - a.rank ||
        a.title.localeCompare(b.title) ||
        a.id.localeCompare(b.id),
    );
}

export function specRows(
  product: CatalogProduct,
  packs: readonly Pack[],
  now: string,
) {
  const sources = sourceInfo(product.sources);
  const fields = [
    ...new Set(
      product.facts
        .filter((f) => fieldDef(f.field, packs))
        .map((f) => `${f.subjectKind}\0${f.subjectId}\0${f.field}`),
    ),
  ].sort();
  return fields.map((key) => {
    const [subjectKind, subjectId, field = ""] = key.split("\0");
    const facts = product.facts.filter(
      (f) =>
        f.subjectKind === subjectKind &&
        f.subjectId === subjectId &&
        f.field === field,
    );
    const resolved = resolveFacts(facts, fieldDef(field, packs), {
      nowMs: Date.parse(now),
      sources,
    });
    return {
      field,
      subjectKind,
      subjectId,
      label: fieldDef(field, packs)?.label ?? field,
      ...resolved,
      evidence: facts.map((f) => ({
        ...f,
        ageMs: Math.max(0, Date.parse(now) - Date.parse(f.retrievedAt)),
        source: product.sources.find((s) => s.id === f.sourceId) ?? null,
      })),
    };
  });
}

/** Transient catalog content has a reversible ID; detail fetches Shopify again. */
export function shopifyProductId(externalId: string): string {
  return `shopify:${encodeURIComponent(externalId)}`;
}
export function fromTransient(
  product: NormalizedProduct,
  source: SourceRecord,
  packs: readonly Pack[],
): CatalogProduct {
  const id = shopifyProductId(product.externalId);
  const offers = product.offers.map((o) => ({
    id: `shopify-offer:${encodeURIComponent(o.externalId)}`,
    source: product.source,
    externalId: o.externalId,
    merchant: o.merchantId,
    sellerId: o.sellerId ?? null,
    priceMinor: o.priceMinor ?? null,
    currency: o.currency,
    shippingMinor: o.shippingMinor ?? null,
    availability: o.availability,
    referenceOnly: o.referenceOnly,
    retrievedAt: o.retrievedAt,
    freshUntil: o.freshUntil,
    url: o.url ?? null,
    tier: checkoutTier(product.source, o.referenceOnly),
  }));
  const drafts = toDrafts(
    product.facts,
    (c) => {
      if (!c.offerKey) return { kind: "product", id };
      const offer = offers.find((o) => o.externalId === c.offerKey);
      return offer ? { kind: "offer", id: offer.id } : null;
    },
    source,
    (field) => fieldDef(field, packs),
  );
  return {
    id,
    identityKey: identityKey(product),
    title: product.title,
    brand: product.brand ?? null,
    gtin: product.gtin ?? null,
    mpn: product.mpn ?? null,
    upid: product.upid ?? null,
    category: product.category ?? null,
    roles: product.roles,
    imageUrl: product.imageUrl ?? null,
    attributes: product.attributes,
    refs: [
      {
        source: product.source,
        externalId: product.externalId,
        url: product.url ?? null,
      },
    ],
    offers,
    facts: drafts.map((f, i) => ({
      ...f,
      id: `${id}:fact:${i}`,
      conflict: false,
    })),
    sources: [
      {
        id: source.id,
        url: source.url,
        sourceType: source.sourceType,
        contentHash: source.contentHash,
        contentType: source.contentType,
        storagePath: null,
        httpStatus: source.httpStatus,
        fetchedAt: source.fetchedAt,
      },
    ],
    rank: 0,
    proof: [],
  };
}
