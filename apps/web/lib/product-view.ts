import type { CatalogProduct } from "@cartel/catalog";
import { productProof, specRows } from "@cartel/catalog";
import {
  type EvidenceState,
  evidenceLabel,
  formatAge,
  type Requirement,
} from "@cartel/contracts";
import { SOURCE_AUTHORITY } from "@cartel/evidence";
import {
  fieldDef,
  formatMoneyText,
  formatValue,
  type Pack,
} from "@cartel/proof-engine";
import type { CheckoutTier } from "@/components/cartel/checkout-tier-badge";
import type { EvidenceLevel } from "@/components/cartel/evidence-badge";
import type { ProductCardData } from "@/components/cartel/product-card";
import { ruleText } from "./workspace";

/*
 * Catalog products as the product page, search cards and compare table
 * show them (TASKS T11.15–T11.19). Verdicts come from the engine
 * (productProof); spec rows from specRows. Offers never feed spec facts.
 */

/** "4k" reads as "4K", as in the workspace. */
const show = (
  v: Parameters<typeof formatValue>[0],
  def: Parameters<typeof formatValue>[1],
) => {
  const t = formatValue(v, def);
  return /^\d+k$/i.test(t) ? t.toUpperCase() : t;
};

export const MERCHANT_NAME: Record<string, string> = {
  greathub: "GreatHub (test merchant)",
  shopify: "Shopify Catalog",
  upcitemdb: "UPCitemdb",
  icecat: "Icecat",
};

export function uiTier(
  t: CatalogProduct["offers"][number]["tier"],
): CheckoutTier {
  return t === "proof_only" ? "proof" : t;
}

function sourceName(s: CatalogProduct["sources"][number] | null | undefined) {
  if (!s) return "Unknown source";
  if (s.sourceType === "fixture") return s.url;
  if (s.sourceType === "json_ld") {
    try {
      const host = new URL(s.url).hostname;
      return host.includes("greathub") || host === "localhost"
        ? "GreatHub listing"
        : host;
    } catch {
      return "Listing";
    }
  }
  return MERCHANT_NAME[s.sourceType] ?? s.sourceType.replace(/_/g, " ");
}

/** The evidence chip for a resolved spec: who says so, by the strongest source. */
export function levelFor(
  state: EvidenceState,
  authority: string | undefined,
  conflict: boolean,
  reason: string | null,
): EvidenceLevel {
  if (reason === "conflict" || (state === "unknown" && conflict))
    return "disagree";
  if (state === "unknown") return "cant";
  if (state === "verified") return "confirmed";
  if (state === "estimated") return "estimate";
  if (state === "supported") return "suggests";
  if (authority === "manufacturer" || authority === "government")
    return "manufacturer";
  if (authority === "catalog") return "catalog";
  return "seller";
}

export type SpecView = {
  field: string;
  label: string;
  value: string;
  level: EvidenceLevel;
  source: string;
  checked: string;
  /** When sources disagree, each claim side by side. */
  claims:
    | { source: string; value: string; level: EvidenceLevel; checked: string }[]
    | null;
  role: string | null;
  /** The resolved value as a rule form takes it, when it can become a rule. */
  input: { value: string; unit?: string } | null;
};

function ruleInput(v: unknown): SpecView["input"] {
  if (typeof v === "boolean") return { value: v ? "yes" : "no" };
  if (typeof v === "string") return { value: v };
  if (v && typeof v === "object" && "value" in v && "unit" in v)
    return {
      value: String((v as { value: number }).value),
      unit: String((v as { unit: string }).unit),
    };
  return null;
}

export type CheckView = {
  id: string;
  rule: string;
  status: "pass" | "fail" | "unknown" | "estimate";
  value: string;
  evidence: string;
};

export type OfferView = {
  id: string;
  merchant: string;
  price: string | null;
  priceMinor: number | null;
  availability: string;
  delivery: string | null;
  tier: CheckoutTier;
  referenceOnly: boolean;
  url: string | null;
};

export type ProductView = {
  id: string;
  title: string;
  brand: string | null;
  category: string | null;
  gtin: string | null;
  roles: string[];
  offers: OfferView[];
  specs: SpecView[];
  checks: CheckView[];
};

const AVAILABILITY: Record<string, string> = {
  in_stock: "In stock",
  out_of_stock: "Out of stock",
  preorder: "Preorder",
  limited: "Limited stock",
  unknown: "Availability unknown",
};

export function productView(
  p: CatalogProduct,
  requirements: readonly Requirement[],
  packs: readonly Pack[],
  now: string,
): ProductView {
  const authority = (sourceId: string) => {
    const s = p.sources.find((x) => x.id === sourceId);
    return s ? SOURCE_AUTHORITY[s.sourceType] : undefined;
  };
  const rows = specRows(p, packs, now).filter(
    (r) => r.subjectKind === "product" && !r.field.startsWith("offer."),
  );
  const specs: SpecView[] = rows.map((r) => {
    const def = fieldDef(r.field, packs);
    // The receipt shown is the strongest source that agrees, in the pack's authority order.
    const rank = (sourceId: string) => {
      const i = (def?.authority ?? []).indexOf(authority(sourceId) as never);
      return i < 0 ? 99 : i;
    };
    const lead =
      r.evidence
        .filter((e) => r.factIds.includes(e.id))
        .sort((a, b) => rank(a.sourceId) - rank(b.sourceId))[0] ??
      r.evidence[0];
    const disagree = r.reason === "conflict";
    const byValue = new Map<string, (typeof r.evidence)[number]>();
    for (const e of r.evidence)
      byValue.set(`${e.sourceId}:${JSON.stringify(e.value)}`, e);
    return {
      field: r.field,
      label: r.label,
      value:
        r.state === "unknown"
          ? disagree
            ? "Sources disagree"
            : "—"
          : show(r.value, def),
      level: levelFor(
        r.state,
        lead ? authority(lead.sourceId) : undefined,
        r.conflict,
        r.reason,
      ),
      source: sourceName(lead?.source),
      checked: lead ? formatAge(lead.ageMs / 1000) : "—",
      claims: disagree
        ? [...byValue.values()].map((e) => ({
            source: sourceName(e.source),
            value: show(e.value, def),
            level: levelFor(e.state, authority(e.sourceId), false, null),
            checked: formatAge(e.ageMs / 1000),
          }))
        : null,
      role: p.roles.find((role) => r.field.startsWith(`${role}.`)) ?? null,
      input: r.state === "unknown" ? null : ruleInput(r.value),
    };
  });
  const proof = productProof(p, requirements, packs, now);
  const checks: CheckView[] = proof.map((r) => {
    const req = requirements.find((x) => x.id === r.requirementId);
    const def = req ? fieldDef(req.field, packs) : undefined;
    const fact = p.facts.find((x) => r.factIds.includes(x.id));
    const src = fact
      ? p.sources.find((s) => s.id === fact.sourceId)
      : undefined;
    const age = fact
      ? Math.max(0, (Date.parse(now) - Date.parse(fact.retrievedAt)) / 1000)
      : null;
    return {
      id: `${r.requirementId}:${r.scope.kind === "item" ? r.scope.offerId : ""}`,
      rule: req ? ruleText(req, packs) : r.requirementId,
      status:
        r.verdict === "fail"
          ? "fail"
          : r.verdict === "unknown"
            ? "unknown"
            : r.evidenceState === "estimated"
              ? "estimate"
              : "pass",
      value: r.verdict === "unknown" ? "—" : show(r.observed, def),
      evidence: evidenceLabel(r.evidenceState, sourceName(src), age, r.reason),
    };
  });
  // One row per rule: an offer-scoped duplicate says nothing new here.
  const seen = new Set<string>();
  const unique = checks.filter((c) => {
    const k = c.rule;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return {
    id: p.id,
    title: p.title,
    brand: p.brand,
    category: p.category,
    gtin: p.gtin,
    roles: p.roles,
    offers: p.offers.map((o) => ({
      id: o.id,
      merchant: o.referenceOnly
        ? `Seen at ${MERCHANT_NAME[o.merchant] ?? o.merchant}`
        : (MERCHANT_NAME[o.merchant] ?? o.merchant),
      price:
        o.priceMinor === null
          ? null
          : formatMoneyText(o.priceMinor, o.currency),
      priceMinor: o.priceMinor,
      availability: AVAILABILITY[o.availability] ?? o.availability,
      delivery: null,
      tier: uiTier(o.tier),
      referenceOnly: o.referenceOnly,
      url: o.url,
    })),
    specs,
    checks: unique,
  };
}

/** A search result card: the first buyable price and one spec with its receipt. */
export function productCard(
  p: CatalogProduct,
  packs: readonly Pack[],
  now: string,
): ProductCardData {
  const offer = p.offers.find((o) => !o.referenceOnly) ?? p.offers[0];
  const v = productView(p, [], packs, now);
  const spec =
    v.specs.find((s) => s.level !== "cant" && s.level !== "disagree") ??
    v.specs[0];
  return {
    id: p.id,
    name: p.title,
    price:
      offer?.priceMinor != null
        ? formatMoneyText(offer.priceMinor, offer.currency)
        : "Price not listed",
    fact: spec ? `${spec.label} ${spec.value}` : undefined,
    evidence: spec?.level ?? "cant",
    // "Confirmed" always names its source and age (SDD §17.3).
    evidenceDetail:
      spec?.level === "confirmed"
        ? `${spec.source} · ${spec.checked}`
        : undefined,
    source: offer ? (MERCHANT_NAME[offer.source] ?? offer.source) : "Catalog",
    tier: offer ? uiTier(offer.tier) : "proof",
    href: `/p/${encodeURIComponent(p.id)}`,
  };
}
