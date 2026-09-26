import type { Database, Json } from "@proofcart/contracts/db";
import { fieldDef, type Pack } from "@proofcart/proof-engine";
import type { createIcecat } from "./adapters/icecat";
import { icecatClaims, icecatIdentity } from "./adapters/icecat";
import type { CheckoutOfferUpdate } from "./checkout";
import { toDrafts } from "./claims";
import { type WriteFactsResult, writeFacts } from "./fact-store";
import type { Db, EvidenceStore } from "./supabase";
import type {
  ClaimedFact,
  NormalizedProduct,
  SourceRecord,
  SubjectKind,
} from "./types";

/*
 * Persisting what adapters read. Identity resolution follows SDD §11.5:
 * the same source record first, then GTIN, then Shopify UPID, then
 * brand + MPN. Every source record keeps a `product_external_refs` row, so a
 * product page can show which sources know it.
 */

type ExternalRefSource =
  Database["public"]["Tables"]["product_external_refs"]["Insert"]["source"];

export type IngestResult = {
  productId: string;
  created: boolean;
  offerIds: Record<string, string>;
  facts: WriteFactsResult;
};

function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

function check<T>(
  r: { data: T; error: { message: string } | null },
  what: string,
): T {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return r.data;
}

/** Finds the product a source record describes, in merge order. */
export async function resolveProductId(
  db: Db,
  p: Pick<
    NormalizedProduct,
    "source" | "externalId" | "gtin" | "upid" | "brand" | "mpn"
  >,
): Promise<string | null> {
  const ref = check(
    await db
      .from("product_external_refs")
      .select("product_id")
      .eq("source", p.source)
      .eq("external_id", p.externalId)
      .maybeSingle(),
    "external ref lookup",
  );
  if (ref) return ref.product_id;
  if (p.gtin) {
    const byGtin = check(
      await db.from("products").select("id").eq("gtin", p.gtin).maybeSingle(),
      "gtin lookup",
    );
    if (byGtin) return byGtin.id;
  }
  if (p.upid) {
    const byUpid = check(
      await db
        .from("products")
        .select("id")
        .eq("upid", p.upid)
        .limit(1)
        .maybeSingle(),
      "upid lookup",
    );
    if (byUpid) return byUpid.id;
  }
  if (p.brand && p.mpn) {
    const byMpn = check(
      await db
        .from("products")
        .select("id")
        .ilike("brand", escapeLike(p.brand))
        .ilike("mpn", escapeLike(p.mpn))
        .limit(1)
        .maybeSingle(),
      "brand+mpn lookup",
    );
    if (byMpn) return byMpn.id;
  }
  return null;
}

async function createProduct(
  db: Db,
  p: NormalizedProduct,
): Promise<{ id: string; created: boolean }> {
  const { data, error } = await db
    .from("products")
    .insert({
      source: p.source,
      external_id: p.externalId,
      title: p.title.slice(0, 500),
      brand: p.brand ?? null,
      gtin: p.gtin ?? null,
      mpn: p.mpn ?? null,
      upid: p.upid ?? null,
      category: p.category ?? null,
      roles: p.roles,
      image_url: p.imageUrl ?? null,
      attributes: p.attributes,
    })
    .select("id")
    .single();
  if (!error) return { id: data.id, created: true };
  // Another writer created the same GTIN first; merge into theirs.
  if (error.code === "23505") {
    const id = await resolveProductId(db, p);
    if (id) return { id, created: false };
  }
  throw new Error(`product insert failed: ${error.message}`);
}

/** Fills columns the stored product is missing; never overwrites what another source said. */
async function fillProduct(
  db: Db,
  id: string,
  p: NormalizedProduct,
): Promise<void> {
  const current = check(
    await db
      .from("products")
      .select("brand, gtin, mpn, upid, category, roles, image_url, attributes")
      .eq("id", id)
      .maybeSingle(),
    "product read",
  );
  if (!current) return;
  const patch: Database["public"]["Tables"]["products"]["Update"] = {};
  if (!current.brand && p.brand) patch.brand = p.brand;
  if (!current.mpn && p.mpn) patch.mpn = p.mpn;
  if (!current.upid && p.upid) patch.upid = p.upid;
  if (!current.category && p.category) patch.category = p.category;
  if (!current.image_url && p.imageUrl) patch.image_url = p.imageUrl;
  const roles = [...new Set([...current.roles, ...p.roles])];
  if (roles.length !== current.roles.length) patch.roles = roles;
  const attrs = (current.attributes ?? {}) as Record<string, Json>;
  const newAttrs = Object.fromEntries(
    Object.entries(p.attributes).filter(([k]) => !(k in attrs)),
  );
  if (Object.keys(newAttrs).length > 0)
    patch.attributes = { ...attrs, ...newAttrs };
  if (Object.keys(patch).length > 0) {
    const { error } = await db.from("products").update(patch).eq("id", id);
    if (error) throw new Error(`product update failed: ${error.message}`);
  }
  if (!current.gtin && p.gtin) {
    // A GTIN already owned by another product means the records disagree about identity; keep both as they are.
    await db.from("products").update({ gtin: p.gtin }).eq("id", id);
  }
}

async function addExternalRef(
  db: Db,
  productId: string,
  p: Pick<NormalizedProduct, "source" | "externalId" | "upid" | "gtin" | "url">,
) {
  const { error } = await db.from("product_external_refs").upsert(
    {
      product_id: productId,
      source: p.source as ExternalRefSource,
      external_id: p.externalId,
      upid: p.upid ?? null,
      gtin: p.gtin ?? null,
      url: p.url ?? null,
    },
    { onConflict: "source,external_id" },
  );
  if (error) throw new Error(`external ref upsert failed: ${error.message}`);
}

async function upsertOffers(
  db: Db,
  productId: string,
  p: NormalizedProduct,
): Promise<Record<string, string>> {
  if (p.offers.length === 0) return {};
  const { data, error } = await db
    .from("offers")
    .upsert(
      p.offers.map((o) => ({
        product_id: productId,
        source: p.source,
        external_id: o.externalId,
        merchant_id: o.merchantId,
        seller_id: o.sellerId ?? null,
        price_minor: o.priceMinor ?? null,
        currency: o.currency,
        shipping_minor: o.shippingMinor ?? null,
        availability: o.availability,
        url: o.url ?? null,
        reference_only: o.referenceOnly,
        retrieved_at: o.retrievedAt,
        fresh_until: o.freshUntil,
      })),
      { onConflict: "source,external_id" },
    )
    .select("id, external_id");
  if (error) throw new Error(`offer upsert failed: ${error.message}`);
  return Object.fromEntries(data.map((r) => [r.external_id, r.id]));
}

/** Binds claims to stored rows and writes them. Claims about unknown offers are dropped. */
export function writeClaims(
  store: EvidenceStore,
  claims: readonly ClaimedFact[],
  target: { productId: string; offerIds?: Record<string, string> },
  source: Pick<SourceRecord, "id" | "fetchedAt">,
  packs: readonly Pack[],
): Promise<WriteFactsResult> {
  const defFor = (field: string) => fieldDef(field, packs);
  const drafts = toDrafts(
    claims,
    (c): { kind: SubjectKind; id: string } | null => {
      if (!c.offerKey) return { kind: "product", id: target.productId };
      const id = target.offerIds?.[c.offerKey];
      return id ? { kind: "offer", id } : null;
    },
    source,
    defFor,
  );
  return writeFacts(store, drafts, { defFor });
}

/** Stores one normalized product from a source: product, identity ref, offers and facts. */
export async function ingestProduct(
  db: Db,
  store: EvidenceStore,
  p: NormalizedProduct,
  source: Pick<SourceRecord, "id" | "fetchedAt">,
  packs: readonly Pack[],
): Promise<IngestResult> {
  const existing = await resolveProductId(db, p);
  const { id: productId, created } = existing
    ? { id: existing, created: false }
    : await createProduct(db, p);
  if (!created) await fillProduct(db, productId, p);
  await addExternalRef(db, productId, p);
  const offerIds = await upsertOffers(db, productId, p);
  const facts = await writeClaims(
    store,
    p.facts,
    { productId, offerIds },
    source,
    packs,
  );
  return { productId, created, offerIds, facts };
}

export type IcecatEnrichment = {
  found: boolean;
  source: SourceRecord;
  facts: WriteFactsResult;
};

/**
 * On product upsert with a GTIN (T7.10): fetch the manufacturer sheet and
 * write its facts. Disagreements with seller specs are flagged by the writer.
 */
export async function enrichWithIcecat(
  db: Db,
  store: EvidenceStore,
  icecat: ReturnType<typeof createIcecat>,
  product: { id: string; gtin: string; roles: readonly string[] },
  packs: readonly Pack[],
): Promise<IcecatEnrichment> {
  const { source, sheet } = await icecat.byGtin(product.gtin);
  if (!sheet)
    return { found: false, source, facts: { insertedIds: [], conflicts: [] } };
  const identity = icecatIdentity(sheet);
  await addExternalRef(db, product.id, {
    source: "icecat",
    externalId: String(sheet.GeneralInfo.IcecatId ?? product.gtin),
    gtin: product.gtin,
  });
  if (identity.brand || identity.mpn) {
    await fillProduct(db, product.id, {
      source: "icecat",
      externalId: String(sheet.GeneralInfo.IcecatId ?? product.gtin),
      title: identity.title ?? "",
      ...(identity.brand ? { brand: identity.brand } : {}),
      ...(identity.mpn ? { mpn: identity.mpn } : {}),
      roles: [],
      attributes: {},
      offers: [],
      facts: [],
    });
  }
  const claims = icecatClaims(sheet, { packs, roles: product.roles });
  const facts = await writeClaims(
    store,
    claims,
    { productId: product.id },
    source,
    packs,
  );
  return { found: true, source, facts };
}

/** Writes a checkout quote onto the stored offer row (price, terms, freshness). */
export async function applyCheckoutOffer(
  db: Db,
  offerId: string,
  u: CheckoutOfferUpdate,
): Promise<void> {
  const { error } = await db
    .from("offers")
    .update({
      ...(u.priceMinor !== null ? { price_minor: u.priceMinor } : {}),
      currency: u.currency,
      availability: u.availability,
      final_sale: u.finalSale,
      return_policy: u.returnPolicy,
      delivery_earliest: u.deliveryEarliest,
      delivery_latest: u.deliveryLatest,
      ...(u.sellerId ? { seller_id: u.sellerId } : {}),
      retrieved_at: u.retrievedAt,
      fresh_until: u.freshUntil,
    })
    .eq("id", offerId);
  if (error) throw new Error(`offer update failed: ${error.message}`);
}
