import { fieldDef, type Pack } from "@cartel/proof-engine";
import { claim, normalizeGtin } from "../claims";
import {
  type FetchLike,
  httpRequest,
  parseJsonBody,
  SourceError,
} from "../http";
import { cachedFetch, type Snapshot, type SnapshotStore } from "../snapshot";
import { type ClaimedFact, SOURCE_AUTHORITY } from "../types";

/*
 * Open Food Facts (SDD §11.2, T7.11, stretch). A free, open product database
 * keyed by barcode: `GET /api/v2/product/{barcode}.json`. It asks for a
 * descriptive User-Agent naming the app and a contact, and for reads to stay
 * well under 100 a minute, so every lookup is cached for a day.
 *
 * What it gives the grocery pack: allergens and traces as tags
 * (`en:milk` → `milk`), the ingredient list as written, and a gluten-free
 * label. It is a crowd-sourced catalog, so every fact is `source_stated` at
 * best, and a missing label never becomes "not gluten-free".
 */

const LABEL = "Open Food Facts";
export const OFF_API = "https://world.openfoodfacts.org/api/v2/product";
const FIELDS = [
  "code",
  "product_name",
  "product_name_en",
  "brands",
  "quantity",
  "categories",
  "allergens_tags",
  "traces_tags",
  "ingredients_text_en",
  "ingredients_text",
  "labels_tags",
  "image_front_url",
].join(",");

export type OffProduct = {
  code?: string;
  product_name?: string;
  product_name_en?: string;
  brands?: string;
  quantity?: string;
  categories?: string;
  allergens_tags?: string[];
  traces_tags?: string[];
  ingredients_text_en?: string;
  ingredients_text?: string;
  labels_tags?: string[];
  image_front_url?: string;
};

type OffResponse = {
  status?: number;
  status_verbose?: string;
  product?: OffProduct;
};

/** `en:soybeans` → `soybeans`; tags in other languages are dropped, not guessed. */
export function offTagValues(tags: readonly string[] | undefined): string[] {
  return [
    ...new Set(
      (tags ?? [])
        .filter((t) => t.startsWith("en:"))
        .map((t) => t.slice(3).trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
}

const GLUTEN_FREE = new Set(["en:no-gluten", "en:gluten-free"]);

/** Grocery-pack claims from one Open Food Facts record. */
export function offClaims(
  product: OffProduct,
  opts: { packs: readonly Pack[] },
): ClaimedFact[] {
  const authority = SOURCE_AUTHORITY.openfoodfacts;
  const out: ClaimedFact[] = [];
  const push = (
    field: string,
    value: ClaimedFact["value"],
    raw: string | undefined,
  ) => {
    const def = fieldDef(field, opts.packs);
    if (!def) return;
    out.push(claim(field, value, raw, authority, def, "openfoodfacts"));
  };
  if (product.allergens_tags) {
    const allergens = offTagValues(product.allergens_tags);
    push("food.allergens", allergens, product.allergens_tags.join(", "));
  }
  if (product.traces_tags) {
    const traces = offTagValues(product.traces_tags);
    push("food.traces", traces, product.traces_tags.join(", "));
  }
  const ingredients = (
    product.ingredients_text_en ||
    product.ingredients_text ||
    ""
  ).trim();
  if (ingredients) push("food.ingredients", ingredients, ingredients);
  const glutenLabel = product.labels_tags?.find((t) => GLUTEN_FREE.has(t));
  // Only a positive label is a claim; its absence says nothing about gluten.
  if (glutenLabel) push("food.gluten_free", true, glutenLabel);
  return out;
}

export type OffIdentity = {
  gtin?: string;
  title?: string;
  brand?: string;
  category?: string;
  imageUrl?: string;
};

export function offIdentity(product: OffProduct): OffIdentity {
  const gtin = normalizeGtin(product.code);
  const title = (product.product_name_en || product.product_name)?.trim();
  const brand = product.brands?.split(",")[0]?.trim();
  const category = product.categories?.split(",").at(-1)?.trim();
  return {
    ...(gtin ? { gtin } : {}),
    ...(title ? { title } : {}),
    ...(brand ? { brand } : {}),
    ...(category ? { category } : {}),
    ...(product.image_front_url?.startsWith("https://")
      ? { imageUrl: product.image_front_url }
      : {}),
  };
}

export type OpenFoodFactsOptions = {
  store: SnapshotStore;
  /** `AppName/Version (contact)`, as Open Food Facts asks. */
  userAgent: string;
  fetch?: FetchLike;
  /** Default 24 h. */
  cacheTtlMs?: number;
  timeoutMs?: number;
  now?: () => Date;
};

export type OpenFoodFactsResult = {
  source: Snapshot;
  product: OffProduct | null;
};

export function createOpenFoodFacts(opts: OpenFoodFactsOptions) {
  if (!opts.userAgent.trim())
    throw new SourceError(LABEL, "not_configured", "OFF_USER_AGENT is not set");

  return {
    label: LABEL,
    async byGtin(gtin: string): Promise<OpenFoodFactsResult> {
      const g = normalizeGtin(gtin);
      if (!g)
        throw new SourceError(LABEL, "invalid_response", "not a valid GTIN");
      // OFF stores EAN-13 / UPC-A codes; a GTIN-14 with a leading zero is found by its 13 digits.
      const code = g.length === 14 ? g.replace(/^0/, "") : g;
      const url = `${OFF_API}/${code}.json?fields=${FIELDS}`;
      const source = await cachedFetch(
        {
          key: url,
          sourceType: "openfoodfacts",
          ttlMs: opts.cacheTtlMs ?? 86_400_000,
          ...(opts.now ? { now: opts.now } : {}),
          fetch: () =>
            httpRequest({
              source: LABEL,
              url,
              headers: {
                Accept: "application/json",
                "User-Agent": opts.userAgent,
              },
              ...(opts.fetch ? { fetch: opts.fetch } : {}),
              ...(opts.timeoutMs ? { timeoutMs: opts.timeoutMs } : {}),
              ...(opts.now ? { now: opts.now } : {}),
            }),
        },
        opts.store,
      );
      const status = source.httpStatus ?? 0;
      if (status === 404) return { source, product: null };
      if (status >= 400)
        throw new SourceError(LABEL, "http", `HTTP ${status}`, status);
      const body = parseJsonBody(LABEL, source.bytes) as OffResponse;
      // `status: 0` is "product not found", which is an answer, not an outage.
      if (body.status !== 1 || !body.product) return { source, product: null };
      return { source, product: body.product };
    },
  };
}
