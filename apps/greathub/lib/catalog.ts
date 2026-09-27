import "server-only";
import type { DEPARTMENTS } from "./labels";
import { db } from "./supabase/admin";
import type { Json } from "./supabase/db";

export interface SpecEntry {
  name: string;
  value: string;
}

export type ReturnTerms = {
  returnable: boolean;
  windowDays: number;
  feeMinor: number;
  finalSale: boolean;
};

export interface OfferView {
  id: string;
  priceMinor: number;
  currency: string;
  availability: "in_stock" | "limited" | "out_of_stock";
  stock: number;
  deliveryMinDays: number;
  deliveryMaxDays: number;
  finalSale: boolean;
  packSize: number;
  subscription: { every: string; priceMinor: number } | null;
  shippingFeeMinor: number;
  revision: number;
  updatedAt: string;
  seller: { id: string; name: string };
  returnPolicy: { id: string; name: string; terms: ReturnTerms };
}

export interface VariantView {
  /** The listing that carries this variant's title, specs and offer. */
  listingId: string;
  sku: string;
  gtin: string;
  mpn: string;
  optionLabel: string | null;
  title: string;
  spec: SpecEntry[];
  /** What the page's JSON-LD claims; differs from `spec` after a jsonld_conflict. */
  jsonldSpec: SpecEntry[];
  injectionText: string | null;
  offer: OfferView;
  /** Set after a variant swap: the listing ships a different item. */
  shipsAs: { sku: string; gtin: string; mpn: string } | null;
}

export interface ProductSummary {
  id: string;
  slug: string;
  brand: string;
  name: string;
  department: keyof typeof DEPARTMENTS;
  category: string;
  roles: string[];
  description: string;
}

export interface ProductView extends ProductSummary {
  variants: VariantView[];
}

export interface CartVariant extends VariantView {
  product: Pick<ProductSummary, "slug" | "brand" | "name" | "category">;
}

const OFFER_COLUMNS = `id, price_minor, currency, availability, stock, delivery_min_days,
  delivery_max_days, final_sale, pack_size, subscription, shipping_fee_minor, revision, updated_at,
  sellers(id, name), policies(id, name, terms),
  ships:variants!offers_ships_variant_id_fkey(sku, gtin, mpn)`;
const LISTING_COLUMNS = `id, title, spec, jsonld_spec, injection_text, offers(${OFFER_COLUMNS})`;
const VARIANT_COLUMNS = `id, sku, gtin, mpn, option_label, sort_order, listings(${LISTING_COLUMNS})`;

function spec(value: Json | null): SpecEntry[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((e) =>
    e &&
    typeof e === "object" &&
    !Array.isArray(e) &&
    typeof e.name === "string" &&
    typeof e.value === "string"
      ? [{ name: e.name, value: e.value }]
      : [],
  );
}

function terms(value: Json): ReturnTerms {
  const t = (value ?? {}) as Record<string, unknown>;
  return {
    returnable: t.returnable === true,
    windowDays: Number(t.windowDays ?? 0),
    feeMinor: Number(t.feeMinor ?? 0),
    finalSale: t.finalSale === true,
  };
}

function subscription(value: Json | null): OfferView["subscription"] {
  const s = value as { every?: unknown; priceMinor?: unknown } | null;
  return s && typeof s.every === "string" && typeof s.priceMinor === "number"
    ? { every: s.every, priceMinor: s.priceMinor }
    : null;
}

type Row = Record<string, unknown>;
/** PostgREST embeds are an object or a one-element array depending on the FK direction. */
function one(v: unknown): Row | null {
  const x = Array.isArray(v) ? v[0] : v;
  return x && typeof x === "object" ? (x as Row) : null;
}

function toVariant(v: Row): VariantView | null {
  const listing = one(v.listings);
  const offer = listing ? one(listing.offers) : null;
  if (!listing || !offer) return null;
  const seller = one(offer.sellers);
  const policy = one(offer.policies);
  const ships = one(offer.ships);
  const listed = spec(listing.spec as Json);
  const jsonld = listing.jsonld_spec
    ? spec(listing.jsonld_spec as Json)
    : listed;
  return {
    listingId: String(listing.id),
    sku: String(v.sku),
    gtin: String(v.gtin),
    mpn: String(v.mpn),
    optionLabel: (v.option_label as string | null) ?? null,
    title: String(listing.title),
    spec: listed,
    jsonldSpec: jsonld,
    injectionText: (listing.injection_text as string | null) ?? null,
    offer: {
      id: String(offer.id),
      priceMinor: Number(offer.price_minor),
      currency: String(offer.currency),
      availability: offer.availability as OfferView["availability"],
      stock: Number(offer.stock),
      deliveryMinDays: Number(offer.delivery_min_days),
      deliveryMaxDays: Number(offer.delivery_max_days),
      finalSale: offer.final_sale === true,
      packSize: Number(offer.pack_size),
      subscription: subscription(offer.subscription as Json),
      shippingFeeMinor: Number(offer.shipping_fee_minor),
      revision: Number(offer.revision),
      updatedAt: String(offer.updated_at),
      seller: { id: String(seller?.id), name: String(seller?.name) },
      returnPolicy: {
        id: String(policy?.id),
        name: String(policy?.name),
        terms: terms((policy?.terms ?? {}) as Json),
      },
    },
    shipsAs: ships
      ? {
          sku: String(ships.sku),
          gtin: String(ships.gtin),
          mpn: String(ships.mpn),
        }
      : null,
  };
}

function toSummary(p: Row): ProductSummary {
  return {
    id: String(p.id),
    slug: String(p.slug),
    brand: String(p.brand),
    name: String(p.name),
    department: p.department as ProductSummary["department"],
    category: String(p.category),
    roles: (p.roles as string[]) ?? [],
    description: String(p.description),
  };
}

function toProduct(p: Row): ProductView {
  const variants = ((p.variants as Row[]) ?? [])
    .sort((a, b) => Number(a.sort_order) - Number(b.sort_order))
    .map(toVariant)
    .filter((v): v is VariantView => v !== null);
  return { ...toSummary(p), variants };
}

const PRODUCT_COLUMNS = `id, slug, brand, name, department, category, roles, description, variants(${VARIANT_COLUMNS})`;

export async function listProducts(): Promise<ProductView[]> {
  const { data, error } = await db()
    .from("products")
    .select(PRODUCT_COLUMNS)
    .order("department")
    .order("category")
    .order("name");
  if (error) throw new Error(`catalog query failed: ${error.message}`);
  return (data as unknown as Row[]).map(toProduct);
}

export async function getProduct(slug: string): Promise<ProductView | null> {
  const { data, error } = await db()
    .from("products")
    .select(PRODUCT_COLUMNS)
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw new Error(`product query failed: ${error.message}`);
  return data ? toProduct(data as unknown as Row) : null;
}

/** Live offers for a cart, keyed by SKU. Unknown SKUs are simply absent. */
export async function getCartVariants(
  skus: readonly string[],
): Promise<Map<string, CartVariant>> {
  const out = new Map<string, CartVariant>();
  if (skus.length === 0) return out;
  const { data, error } = await db()
    .from("variants")
    .select(`${VARIANT_COLUMNS}, products(slug, brand, name, category)`)
    .in("sku", [...new Set(skus)]);
  if (error) throw new Error(`cart query failed: ${error.message}`);
  for (const row of data as unknown as Row[]) {
    const variant = toVariant(row);
    const product = one(row.products);
    if (variant && product) {
      out.set(variant.sku, {
        ...variant,
        product: {
          slug: String(product.slug),
          brand: String(product.brand),
          name: String(product.name),
          category: String(product.category),
        },
      });
    }
  }
  return out;
}

export interface StorePolicies {
  shipping: { label: string; flatMinor: number };
  tax: { label: string; rateBps: number };
}

export async function getStorePolicies(): Promise<StorePolicies> {
  const { data, error } = await db()
    .from("policies")
    .select("id, terms")
    .in("id", ["ship_standard", "tax_default"]);
  if (error) throw new Error(`policy query failed: ${error.message}`);
  const byId = new Map(
    (data ?? []).map((p) => [p.id, p.terms as Record<string, unknown>]),
  );
  const ship = byId.get("ship_standard") ?? {};
  const tax = byId.get("tax_default") ?? {};
  return {
    shipping: {
      label: String(ship.label ?? "Standard shipping"),
      flatMinor: Number(ship.flatMinor ?? 0),
    },
    tax: {
      label: String(tax.label ?? "Estimated tax"),
      rateBps: Number(tax.rateBps ?? 0),
    },
  };
}

export async function getActiveRecalls(skus: readonly string[]) {
  if (skus.length === 0) return [];
  const { data, error } = await db()
    .from("mock_recalls")
    .select("recall_number, sku, hazard, remedy, posted_at")
    .in("sku", [...skus]);
  if (error) throw new Error(`recall query failed: ${error.message}`);
  return data ?? [];
}

/**
 * The specs each listing had when the catalog was seeded (the state Reset
 * restores), keyed by listing ID. A row that differs was changed by the
 * Chaos Deck; the product page marks it with the Gull's footprint.
 */
export async function getSeededSpecs(): Promise<Map<string, SpecEntry[]>> {
  const { data, error } = await db()
    .from("catalog_baseline")
    .select("listings")
    .maybeSingle();
  if (error) throw new Error(`baseline query failed: ${error.message}`);
  const out = new Map<string, SpecEntry[]>();
  const rows = Array.isArray(data?.listings) ? data.listings : [];
  for (const row of rows) {
    const r = row as Row;
    out.set(String(r.id), spec((r.spec ?? null) as Json));
  }
  return out;
}
