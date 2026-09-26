import {
  hashJson,
  Requirement,
  requirementSetHash,
} from "@proofcart/contracts";
import type { Database, Json } from "@proofcart/contracts/db";
import type {
  NormalizedProduct,
  SourceRecord,
  SourceType,
} from "@proofcart/evidence";
import {
  factFromRow,
  ingestProduct,
  supabaseEvidenceStore,
} from "@proofcart/evidence/supabase";
import type { Pack } from "@proofcart/proof-engine";
import type { SupabaseClient } from "@supabase/supabase-js";
import { identityKey, normalizeProduct, normalizeRoles } from "./normalize";
import { type CatalogProduct, checkoutTier } from "./product";

export type CatalogDb = SupabaseClient<Database>;
const json = (value: unknown): Json =>
  JSON.parse(JSON.stringify(value)) as Json;

export async function storeProduct(
  db: CatalogDb,
  input: NormalizedProduct,
  source: SourceRecord,
  packs: readonly Pack[],
): Promise<string> {
  if (input.source === "shopify")
    throw new Error("Shopify catalog content must remain transient");
  const product = normalizeProduct(input, packs);
  const { data: id, error } = await db.rpc("srv_catalog_identity", {
    p_product: json(product),
  });
  if (error || !id) throw error ?? new Error("identity not returned");
  const result = await ingestProduct(
    db,
    supabaseEvidenceStore(db),
    product,
    source,
    packs,
  );
  if (result.productId !== id)
    throw new Error("identity changed while ingesting");
  return id;
}

export async function loadProducts(
  db: CatalogDb,
  ids: readonly string[],
  ranks: ReadonlyMap<string, number> = new Map(),
  signal?: AbortSignal,
): Promise<CatalogProduct[]> {
  if (!ids.length) return [];
  const unique = [...new Set(ids)];
  const requests = [
    db.from("products").select("*").in("id", unique),
    db
      .from("offers")
      .select("*")
      .in("product_id", unique)
      .neq("source", "shopify"),
    db
      .from("product_external_refs")
      .select("*")
      .in("product_id", unique)
      .neq("source", "shopify"),
  ] as const;
  if (signal) for (const request of requests) request.abortSignal(signal);
  const [products, offers, refs] = await Promise.all(requests);
  if (products.error || offers.error || refs.error)
    throw products.error ?? offers.error ?? refs.error;
  const subjects = [...unique, ...offers.data.map((o) => o.id)];
  const fq = db
    .from("facts")
    .select("*")
    .in("subject_id", subjects)
    .is("superseded_by", null);
  if (signal) fq.abortSignal(signal);
  const facts = await fq;
  if (facts.error) throw facts.error;
  const sourceIds = [...new Set(facts.data.map((f) => f.source_id))];
  const sq = db.from("sources").select("*").in("id", sourceIds);
  if (signal) sq.abortSignal(signal);
  const sources = sourceIds.length ? await sq : { data: [], error: null };
  if (sources.error) throw sources.error;
  const sourceRecords: SourceRecord[] = sources.data.map((s) => ({
    id: s.id,
    url: s.url,
    sourceType: s.source_type as SourceType,
    contentHash: s.content_hash,
    contentType: s.content_type,
    storagePath: s.storage_path,
    httpStatus: s.http_status,
    fetchedAt: new Date(s.fetched_at).toISOString(),
  }));
  return products.data.map((p) => {
    const ownOffers = offers.data.filter((o) => o.product_id === p.id);
    const offerIds = new Set(ownOffers.map((o) => o.id));
    const ownFacts = facts.data
      .filter(
        (f) =>
          (f.subject_kind === "product" && f.subject_id === p.id) ||
          (f.subject_kind === "offer" && offerIds.has(f.subject_id)),
      )
      .map(factFromRow);
    return {
      id: p.id,
      identityKey: identityKey({
        source: p.source as NormalizedProduct["source"],
        externalId: p.external_id ?? p.id,
        gtin: p.gtin ?? undefined,
        upid: p.upid ?? undefined,
        brand: p.brand ?? undefined,
        mpn: p.mpn ?? undefined,
      }),
      title: p.title,
      brand: p.brand,
      gtin: p.gtin,
      mpn: p.mpn,
      upid: p.upid,
      category: p.category,
      roles: normalizeRoles(p.roles),
      imageUrl: p.image_url,
      attributes: p.attributes as Record<string, unknown>,
      refs: refs.data
        .filter((r) => r.product_id === p.id)
        .map((r) => ({
          source: r.source,
          externalId: r.external_id,
          url: r.url,
        })),
      offers: ownOffers.map((o) => ({
        id: o.id,
        source: o.source,
        externalId: o.external_id,
        merchant: o.merchant_id,
        sellerId: o.seller_id,
        priceMinor: o.price_minor,
        currency: o.currency,
        shippingMinor: o.shipping_minor,
        availability: o.availability,
        referenceOnly: o.reference_only,
        retrievedAt: o.retrieved_at,
        freshUntil: o.fresh_until,
        url: o.url,
        tier: checkoutTier(o.source, o.reference_only),
      })),
      facts: ownFacts,
      sources: sourceRecords.filter((s) =>
        ownFacts.some((f) => f.sourceId === s.id),
      ),
      rank: ranks.get(p.id) ?? 0,
      proof: [],
    };
  });
}

export async function localSearch(
  db: CatalogDb,
  query: string,
  source: string,
  limit: number,
  signal: AbortSignal,
  ids?: string[],
) {
  const { data, error } = await db
    .rpc("catalog_search_products", {
      p_query: query,
      p_source: source,
      p_limit: limit,
      ...(ids ? { p_ids: ids } : {}),
    })
    .abortSignal(signal);
  if (error) throw error;
  return loadProducts(
    db,
    data.map((r) => r.product_id),
    new Map(data.map((r) => [r.product_id, r.rank])),
    signal,
  );
}

/** Cache only identities, not plan-specific proofs. Re-read evidence and re-rank on every request. */
export async function cachedSearch(
  db: CatalogDb,
  source: string,
  query: string,
  limit: number,
  signal: AbortSignal,
  fetchProducts: () => Promise<CatalogProduct[]>,
  now = new Date(),
): Promise<{ products: CatalogProduct[]; cached: boolean }> {
  if (source === "shopify")
    return { products: await fetchProducts(), cached: false };
  const key = {
    version: 1,
    source,
    query: query.normalize("NFKC").trim().toLowerCase(),
    limit,
  };
  const hash = await hashJson(key);
  const cached = await db
    .from("search_queries")
    .select("result_product_ids")
    .eq("query_hash", hash)
    .gte("created_at", new Date(now.getTime() - 600_000).toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .abortSignal(signal)
    .maybeSingle();
  signal.throwIfAborted();
  if (!cached.error && cached.data)
    return {
      products: await localSearch(
        db,
        query,
        source,
        limit,
        signal,
        cached.data.result_product_ids,
      ),
      cached: true,
    };
  const products = await fetchProducts();
  signal.throwIfAborted();
  await db
    .from("search_queries")
    .insert({
      query_hash: hash,
      query: key,
      source_status: { [source]: "ok" },
      result_product_ids: products.map((p) => p.id),
      created_at: now.toISOString(),
    })
    .abortSignal(signal);
  // A cache write failure must not discard successfully fetched results.
  signal.throwIfAborted();
  return { products, cached: false };
}

export class CatalogError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(code);
  }
}

/** Explicit ownership check before any service-role query of a private plan. */
export async function planContext(
  db: CatalogDb,
  planId: string,
  userId: string,
) {
  const plan = await db
    .from("plans")
    .select("*")
    .eq("id", planId)
    .eq("user_id", userId)
    .maybeSingle();
  if (plan.error) throw plan.error;
  if (!plan.data) throw new CatalogError("plan_not_found", 404);
  const set = await db
    .from("requirement_sets")
    .select("*")
    .eq("plan_id", planId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (set.error) throw set.error;
  const specs = set.data
    ? await db.from("requirements").select("spec").eq("set_id", set.data.id)
    : { data: [], error: null };
  if (specs.error) throw specs.error;
  return {
    plan: plan.data,
    set: set.data,
    requirements: specs.data.map((r) => Requirement.parse(r.spec)),
  };
}

export async function forkKit(db: CatalogDb, slug: string, userId: string) {
  const [kit, rows] = await Promise.all([
    db.from("kits").select("*").eq("slug", slug).maybeSingle(),
    db
      .from("kit_requirements")
      .select("*")
      .eq("kit_slug", slug)
      .order("requirement_key"),
  ]);
  if (kit.error || rows.error) throw kit.error ?? rows.error;
  if (!kit.data) throw new CatalogError("kit_not_found", 404);
  const pack = kit.data.pack;
  const requirements = rows.data.map((r) =>
    Requirement.parse({
      ...(r.spec as object),
      id: r.requirement_key,
      importance: r.importance,
      provenance: { kind: "pack_default", pack, ruleId: r.requirement_key },
    }),
  );
  const hash = await requirementSetHash(requirements);
  const result = await db.rpc("srv_fork_kit", {
    p_user_id: userId,
    p_slug: slug,
    p_specs: json(requirements),
    p_hash: hash,
  });
  if (result.error) {
    if (/kit_changed|kit_offer_unavailable/.test(result.error.message))
      throw new CatalogError(
        result.error.message.includes("kit_changed")
          ? "kit_changed"
          : "kit_offer_unavailable",
        409,
      );
    throw result.error;
  }
  return result.data as { planId: string; setId: string; basketId: string };
}

export async function loadPlan(db: CatalogDb, planId: string, userId: string) {
  const context = await planContext(db, planId, userId);
  const baskets = await db
    .from("baskets")
    .select("*")
    .eq("plan_id", planId)
    .order("created_at", { ascending: false });
  if (baskets.error) throw baskets.error;
  const ids = baskets.data.map((b) => b.id);
  const items = ids.length
    ? await db.from("basket_items").select("*, offers(*)").in("basket_id", ids)
    : { data: [], error: null };
  if (items.error) throw items.error;
  return {
    ...context,
    baskets: baskets.data.map((b) => ({
      ...b,
      items: items.data
        .filter((i) => i.basket_id === b.id)
        .map((i) => ({
          id: i.id,
          role: i.role,
          qty: i.qty,
          offer: {
            ...i.offers,
            tier: checkoutTier(i.offers.source, i.offers.reference_only),
          },
        })),
    })),
  };
}
