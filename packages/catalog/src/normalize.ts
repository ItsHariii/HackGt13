import { UNIT_DIMENSION, Value } from "@proofcart/contracts";
import type {
  IcecatSheet,
  NormalizedProduct,
  SnapshotStore,
  UcpProduct,
  UpcItem,
} from "@proofcart/evidence";
import {
  icecatClaims,
  icecatIdentity,
  inferRoles,
  jsonLdClaims,
  normalizeGtin,
  normalizeUcpProduct,
  normalizeUpcItem,
} from "@proofcart/evidence";
import {
  type FieldDef,
  fieldDef,
  isQuantity,
  type Pack,
  readAs,
} from "@proofcart/proof-engine";

function typedValue(raw: Value | null, def: FieldDef): Value | null {
  const parsed = Value.safeParse(raw);
  if (!parsed.success) return null;
  const v = parsed.data;
  if (typeof v === "string") return readAs(v, def);
  if (typeof v === "boolean") return def.kind === "boolean" ? v : null;
  if (typeof v === "number")
    return def.kind === "count" ? { value: v, unit: "count" } : null;
  if (Array.isArray(v)) return def.kind === "list" ? v : null;
  if ("amountMinor" in v) return def.kind === "money" ? v : null;
  if ("unit" in v) return UNIT_DIMENSION[v.unit] === def.kind ? v : null;
  if ("min" in v && isQuantity(v.min) && isQuantity(v.max))
    return UNIT_DIMENSION[v.min.unit] === def.kind &&
      UNIT_DIMENSION[v.max.unit] === def.kind
      ? v
      : null;
  return null;
}

/** Source category labels mapped onto the roles declared by the rule packs. */
export function normalizeRoles(roles: readonly string[]): string[] {
  const aliases: Record<string, string> = {
    shirt: "top",
    trousers: "bottom",
    jacket: "outerwear",
  };
  return [...new Set(roles.map((role) => aliases[role] ?? role))];
}

/** Typed claims cross this boundary; unrecognized attributes remain display-only. */
export function normalizeProduct(
  product: NormalizedProduct,
  packs: readonly Pack[],
): NormalizedProduct {
  const referenceKeys = new Set(
    product.offers.filter((o) => o.referenceOnly).map((o) => o.externalId),
  );
  const { gtin: rawGtin, brand: rawBrand, mpn: rawMpn, ...rest } = product;
  // A grouped Shopify product may contain several independently identified variants.
  // Never merge the whole group into the first variant's GTIN/MPN.
  const grouped = product.source === "shopify" && product.offers.length > 1;
  const gtin = grouped ? undefined : normalizeGtin(rawGtin),
    brand = rawBrand?.trim(),
    mpn = grouped ? undefined : rawMpn?.trim();
  return {
    ...rest,
    ...(gtin ? { gtin } : {}),
    ...(brand ? { brand } : {}),
    ...(mpn ? { mpn } : {}),
    roles: normalizeRoles(product.roles),
    facts: product.facts.flatMap((f) => {
      const def = fieldDef(f.field, packs);
      if (
        !def ||
        (f.field.startsWith("offer.") &&
          (!f.offerKey || referenceKeys.has(f.offerKey)))
      )
        return [];
      const value = typedValue(f.value, def);
      return [
        {
          ...f,
          value,
          ...(value === null
            ? { state: "unknown" as const, reason: "no_fact" as const }
            : {}),
        },
      ];
    }),
  };
}

export async function mapUpcItem(item: UpcItem, packs: readonly Pack[]) {
  const product = await normalizeUpcItem(item);
  return product ? normalizeProduct(product, packs) : null;
}

export function mapShopify(
  item: UcpProduct,
  retrievedAt: string,
  packs: readonly Pack[],
) {
  return normalizeProduct(normalizeUcpProduct(item, retrievedAt), packs);
}

export function mapIcecat(
  sheet: IcecatSheet,
  packs: readonly Pack[],
  requestedGtin?: string,
): NormalizedProduct {
  const identity = icecatIdentity(sheet);
  const gtin = normalizeGtin(requestedGtin) ?? identity.gtins[0];
  if (requestedGtin && !identity.gtins.includes(gtin ?? ""))
    throw new Error("Icecat GTIN mismatch");
  const roles = inferRoles(identity.category, identity.title);
  return normalizeProduct(
    {
      source: "icecat",
      externalId: String(
        sheet.GeneralInfo.IcecatId ?? gtin ?? identity.mpn ?? "",
      ),
      title: identity.title ?? identity.mpn ?? "Manufacturer specification",
      ...(identity.brand ? { brand: identity.brand } : {}),
      ...(identity.mpn ? { mpn: identity.mpn } : {}),
      ...(gtin ? { gtin } : {}),
      ...(identity.category ? { category: identity.category } : {}),
      roles,
      attributes: {},
      offers: [],
      facts: icecatClaims(sheet, { packs, roles }),
    },
    packs,
  );
}

export function mapDemoMart(
  product: Omit<NormalizedProduct, "source" | "facts">,
  jsonLd: unknown,
  packs: readonly Pack[],
): NormalizedProduct {
  return normalizeProduct(
    {
      ...product,
      source: "demomart",
      facts: jsonLdClaims(jsonLd, {
        packs,
        roles: normalizeRoles(product.roles),
      }),
    },
    packs,
  );
}

/** A merge hint, never fuzzy title matching. Persistent identity is resolved transactionally. */
export function identityKey(p: {
  source: string;
  externalId: string;
  gtin?: string | undefined;
  upid?: string | undefined;
  brand?: string | undefined;
  mpn?: string | undefined;
}): string {
  const gtin = normalizeGtin(p.gtin);
  if (gtin) return `gtin:${gtin}`;
  if (p.upid) return `upid:${p.upid}`;
  if (p.brand && p.mpn)
    return `mpn:${JSON.stringify([p.brand.trim().toLowerCase(), p.mpn.trim().toLowerCase()])}`;
  return `${p.source}:${p.externalId}`;
}

/** Shopify usage rules forbid caching catalog results. Nothing here writes bytes or rows. */
export function transientSnapshotStore(): SnapshotStore {
  return {
    async putObject() {},
    async insertSource(row) {
      return { ...row, id: crypto.randomUUID(), storagePath: null };
    },
    async findRecentSource() {
      return null;
    },
    async getObject() {
      return null;
    },
  };
}
