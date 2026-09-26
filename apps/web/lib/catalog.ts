import "server-only";
import {
  type CatalogProduct,
  fromTransient,
  mapIcecat,
  normalizeProduct,
  type SearchProvider,
  transientSnapshotStore,
} from "@proofcart/catalog";
import {
  CatalogError,
  cachedSearch,
  localSearch,
  planContext,
  storeProduct,
} from "@proofcart/catalog/supabase";
import {
  createIcecat,
  createShopifyCatalog,
  createUpcItemDb,
  type FetchLike,
  newRateBudget,
  normalizeGtin,
  SourceError,
} from "@proofcart/evidence";
import { supabaseEvidenceStore } from "@proofcart/evidence/supabase";
import { ALL_PACKS, sources } from "./evidence";
import { createAdminClient } from "./supabase/admin";
import { createClient } from "./supabase/server";

const upcBudget = newRateBudget();
export const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function catalogReady() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY)
    throw new CatalogError("catalog_not_configured", 503);
}
export function apiError(error: unknown) {
  if (error instanceof CatalogError)
    return Response.json(
      { error: error.code },
      { status: error.status, headers: { "Cache-Control": "no-store" } },
    );
  if (error instanceof SourceError)
    return Response.json(
      { error: `source_${error.kind}` },
      {
        status: error.kind === "not_configured" ? 503 : 502,
        headers: { "Cache-Control": "no-store" },
      },
    );
  return Response.json(
    { error: "catalog_unavailable" },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}
export const jsonResponse = (value: unknown, status = 200) =>
  Response.json(value, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });

export async function userId() {
  const client = await createClient();
  if (!client) throw new CatalogError("auth_not_configured", 503);
  const { data, error } = await client.auth.getUser();
  if (error || !data.user)
    throw new CatalogError("authentication_required", 401);
  return data.user.id;
}

export async function activeRequirements(url: URL) {
  const planId = url.searchParams.get("planId");
  if (!planId) return [];
  if (!UUID.test(planId)) throw new CatalogError("invalid_plan_id", 400);
  const user = await userId();
  const context = await planContext(createAdminClient(), planId, user);
  return context.requirements;
}

function boundedFetch(signal: AbortSignal): FetchLike {
  return (input, init) =>
    fetch(input, {
      ...init,
      cache: "no-store",
      signal: AbortSignal.any([signal, ...(init?.signal ? [init.signal] : [])]),
    });
}

export function shopify(signal: AbortSignal) {
  const profile = process.env.SHOPIFY_AGENT_PROFILE_URL;
  if (!profile?.startsWith("https://"))
    throw new SourceError(
      "shopify",
      "not_configured",
      "public HTTPS agent profile required",
    );
  return createShopifyCatalog({
    store: transientSnapshotStore(),
    agentProfileUrl: profile,
    cacheTtlMs: 0,
    timeoutMs: 2400,
    maxRetries: 0,
    fetch: boundedFetch(signal),
  });
}

export function catalogProviders(): SearchProvider[] {
  // Icecat enriches exact GTINs and searches already-ingested specs. CPSC is a recall
  // checker, not a product catalog; unsupported stretch adapters are not advertised.
  return [...sources()]
    .filter((source) =>
      ["demomart", "upcitemdb", "shopify", "icecat"].includes(source),
    )
    .map((source) => ({
      source,
      async search(query, limit, signal) {
        if (source === "shopify") {
          const result = await shopify(signal).search(query, { limit, signal });
          return {
            products: result.products
              .slice(0, limit)
              .map((p) =>
                fromTransient(
                  normalizeProduct(p, ALL_PACKS),
                  result.source,
                  ALL_PACKS,
                ),
              ),
          };
        }
        const db = createAdminClient(signal);
        return cachedSearch(db, source, query, limit, signal, async () => {
          if (source === "demomart")
            return localSearch(db, query, source, limit, signal);
          const store = supabaseEvidenceStore(db);
          const ids: string[] = [];
          if (source === "upcitemdb") {
            const key = process.env.UPCITEMDB_USER_KEY;
            const adapter = createUpcItemDb({
              store,
              budget: upcBudget,
              cacheTtlMs: 600_000,
              timeoutMs: 2400,
              fetch: boundedFetch(signal),
              ...(key ? { userKey: key } : {}),
            });
            const gtin = normalizeGtin(query);
            const result = gtin
              ? await adapter.lookup(gtin)
              : await adapter.search(query);
            signal.throwIfAborted();
            const products = result.products.slice(0, limit);
            for (let start = 0; start < products.length; start += 4) {
              signal.throwIfAborted();
              ids.push(
                ...(await Promise.all(
                  products
                    .slice(start, start + 4)
                    .map((p) => storeProduct(db, p, result.source, ALL_PACKS)),
                )),
              );
            }
            return localSearch(db, query, source, limit, signal, ids);
          }
          const gtin = normalizeGtin(query);
          if (gtin) {
            const username = process.env.ICECAT_USERNAME;
            if (!username)
              throw new SourceError(
                "icecat",
                "not_configured",
                "Icecat username required",
              );
            const token = process.env.ICECAT_API_TOKEN;
            const result = await createIcecat({
              store,
              username,
              ...(token ? { apiToken: token } : {}),
              fetch: boundedFetch(signal),
              timeoutMs: 2400,
            }).byGtin(gtin);
            signal.throwIfAborted();
            if (result.sheet)
              ids.push(
                await storeProduct(
                  db,
                  mapIcecat(result.sheet, ALL_PACKS, gtin),
                  result.source,
                  ALL_PACKS,
                ),
              );
            return localSearch(db, query, source, limit, signal, ids);
          }
          return localSearch(db, query, source, limit, signal);
        });
      },
    }));
}

export async function transientProduct(
  id: string,
  signal: AbortSignal,
): Promise<CatalogProduct | null> {
  if (!sources().has("shopify")) return null;
  let externalId: string;
  try {
    externalId = decodeURIComponent(id.slice("shopify:".length));
  } catch {
    throw new CatalogError("invalid_product_id", 400);
  }
  if (!externalId || externalId.length > 1000)
    throw new CatalogError("invalid_product_id", 400);
  const result = await shopify(signal).getProduct(externalId, signal);
  const product = result.products.find((p) => p.externalId === externalId);
  return product
    ? fromTransient(
        normalizeProduct(product, ALL_PACKS),
        result.source,
        ALL_PACKS,
      )
    : null;
}
