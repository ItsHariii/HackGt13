import { canonicalize, sha256Hex } from "@cartel/contracts";
import { normalizeGtin } from "../claims";
import {
  type FetchLike,
  httpRequest,
  parseJsonBody,
  retryAfterMs,
  SourceError,
  sleep,
} from "../http";
import { cachedFetch, type Snapshot, type SnapshotStore } from "../snapshot";
import type {
  Availability,
  ClaimedFact,
  NormalizedOffer,
  NormalizedProduct,
} from "../types";
import { inferRoles } from "./roles";

/*
 * Shopify Catalog over UCP (SDD §11.2, T7.5): JSON-RPC `tools/call` against
 * the global catalog's MCP endpoint. Every request names Cartel's agent
 * profile (`/.well-known/ucp`), which Shopify fetches and version-checks, so
 * the profile must be publicly reachable. Prices are integer minor units.
 *
 * Listings are catalog claims (`source_stated`, "Shopify Catalog"); the
 * checkout tier for these offers is a hand-off to the merchant (SDD §13.7).
 */

export const SHOPIFY_CATALOG_MCP = "https://catalog.shopify.com/api/ucp/mcp";
/** The UCP version the catalog speaks (`x-shopify-ucp-mcp-api-version`, 2026-09-26). */
export const UCP_VERSION = "2026-08-25";
const LABEL = "Shopify Catalog";
const LISTING_TTL_MS = 10 * 60_000;

type Price = { amount: number; currency: string };
type Media = { type?: string; url?: string };
type Category = { value?: string; taxonomy?: string };

export type UcpVariant = {
  id: string;
  sku?: string;
  barcodes?: { type?: string; value?: string }[];
  title?: string;
  url?: string;
  price?: Price;
  list_price?: Price;
  availability?: { available?: boolean; status?: string };
  options?: { name?: string; label?: string }[];
  media?: Media[];
  seller?: { name?: string; links?: { type?: string; url?: string }[] };
  metadata?: Record<string, unknown>;
};

export type UcpProduct = {
  id: string;
  handle?: string;
  title: string;
  description?: { plain?: string; html?: string; markdown?: string };
  url?: string;
  categories?: Category[];
  price_range?: { min?: Price; max?: Price };
  media?: Media[];
  options?: { name?: string; values?: { label?: string }[] }[];
  variants?: UcpVariant[];
  tags?: string[];
  metadata?: Record<string, unknown>;
};

const STATUS: Record<string, Availability> = {
  in_stock: "in_stock",
  backorder: "backorder",
  preorder: "preorder",
  out_of_stock: "out_of_stock",
  discontinued: "discontinued",
};

function variantAvailability(v: UcpVariant): Availability {
  const s = v.availability?.status;
  if (s && STATUS[s]) return STATUS[s] as Availability;
  if (v.availability?.available === true) return "in_stock";
  if (v.availability?.available === false) return "out_of_stock";
  return "unknown";
}

function isApparel(p: UcpProduct): boolean {
  return (p.categories ?? []).some(
    (c) =>
      (c.taxonomy === "shopify" && /^aa(?:-|$)/.test(c.value ?? "")) ||
      /apparel|clothing/i.test(c.value ?? ""),
  );
}

const FIBER =
  /(\d{1,3}(?:\.\d+)?)\s*%\s*([a-z][a-z-]*(?:\s(?!and\b)[a-z][a-z-]*)?)/gi;

/**
 * "55% linen, 45% cotton" → per-fiber percentages. Only well-formed
 * compositions (every part has a percentage, total 100 ± 1) are accepted.
 */
export function parseFiberComposition(
  text: string,
): { fiber: string; pct: number }[] | null {
  const parts = [...text.matchAll(FIBER)].map((m) => ({
    fiber: (m[2] as string).trim().toLowerCase().replace(/\s+/g, "_"),
    pct: Number(m[1]),
  }));
  if (parts.length === 0) return null;
  const total = parts.reduce((s, p) => s + p.pct, 0);
  return Math.abs(total - 100) <= 1 ? parts : null;
}

function metadataText(
  meta: Record<string, unknown> | undefined,
  key: RegExp,
): string | null {
  for (const [k, v] of Object.entries(meta ?? {})) {
    if (key.test(k) && typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function source(
  field: string,
  value: ClaimedFact["value"],
  raw: string,
  offerKey?: string,
): ClaimedFact {
  return {
    ...(offerKey ? { offerKey } : {}),
    field,
    value,
    raw,
    state: "source_stated",
    extractor: "shopify",
  };
}

/** Structured claims only: variant options and merchant metadata, never description prose. */
function productClaims(p: UcpProduct): ClaimedFact[] {
  if (!isApparel(p)) return [];
  const out: ClaimedFact[] = [];
  const material = metadataText(
    p.metadata,
    /^(?:material|fabric|composition|fiber|fibre)s?$/i,
  );
  const fibers = material ? parseFiberComposition(material) : null;
  if (material && fibers) {
    out.push(
      source(
        "garment.fibers",
        fibers.map((f) => f.fiber),
        material,
      ),
    );
    for (const f of fibers)
      out.push(
        source(
          `garment.fiber.${f.fiber}`,
          { value: f.pct, unit: "pct" },
          material,
        ),
      );
  }
  for (const v of p.variants ?? []) {
    for (const o of v.options ?? []) {
      const label = o.label?.trim();
      if (!label) continue;
      if (/^colou?r$/i.test(o.name ?? ""))
        out.push(source("garment.color", label, label, v.id));
      if (/^size$/i.test(o.name ?? ""))
        out.push(source("garment.size", label, label, v.id));
    }
  }
  return out;
}

function https(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const u = new URL(url);
    return u.protocol === "https:" ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}

function merchantOf(p: UcpProduct, v: UcpVariant): string {
  const host = https(v.url ?? p.url);
  return host ? new URL(host).hostname : (v.seller?.name ?? "shopify");
}

/** One UCP product as a normalized product; each variant is an offer. */
export function normalizeUcpProduct(
  p: UcpProduct,
  retrievedAt: string,
): NormalizedProduct {
  const freshUntil = new Date(
    Date.parse(retrievedAt) + LISTING_TTL_MS,
  ).toISOString();
  const variants = p.variants ?? [];
  const gtin = variants
    .flatMap((v) => v.barcodes ?? [])
    .map((b) => normalizeGtin(b.value))
    .find((g): g is string => !!g);
  const offers: NormalizedOffer[] = variants.map((v) => ({
    externalId: v.id,
    merchantId: merchantOf(p, v),
    ...(v.seller?.name ? { sellerId: v.seller.name } : {}),
    title:
      v.title && v.title !== "Default Title"
        ? `${p.title} — ${v.title}`
        : p.title,
    ...(v.price && Number.isSafeInteger(v.price.amount)
      ? { priceMinor: v.price.amount }
      : {}),
    currency: (
      v.price?.currency ??
      p.price_range?.min?.currency ??
      "USD"
    ).toUpperCase(),
    availability: variantAvailability(v),
    ...(https(v.url ?? p.url) ? { url: https(v.url ?? p.url) as string } : {}),
    referenceOnly: false,
    retrievedAt,
    freshUntil,
  }));
  const category =
    (p.categories ?? []).find((c) => c.taxonomy === "merchant")?.value ??
    p.categories?.[0]?.value;
  const image = https(
    (p.media ?? []).find((m) => (m.type ?? "image") === "image")?.url,
  );
  const attributes: Record<string, string> = {};
  for (const [k, v] of Object.entries(p.metadata ?? {})) {
    if (
      typeof v === "string" ||
      typeof v === "number" ||
      typeof v === "boolean"
    )
      attributes[k] = String(v);
  }
  if (p.tags?.length) attributes.tags = p.tags.join(", ");
  return {
    source: "shopify",
    externalId: p.id,
    title: p.title,
    ...(gtin ? { gtin } : {}),
    ...(variants[0]?.sku ? { mpn: variants[0].sku } : {}),
    upid: p.id,
    ...(category ? { category } : {}),
    roles: inferRoles(category, p.title),
    ...(image ? { imageUrl: image } : {}),
    ...(https(p.url) ? { url: https(p.url) as string } : {}),
    attributes,
    offers,
    facts: productClaims(p),
  };
}

export type ShopifyOptions = {
  store: SnapshotStore;
  /** Cartel's public UCP agent profile, e.g. https://cartel.app/.well-known/ucp. */
  agentProfileUrl: string;
  endpoint?: string;
  fetch?: FetchLike;
  timeoutMs?: number;
  /** Retries on rate limiting, with exponential backoff and jitter. */
  maxRetries?: number;
  cacheTtlMs?: number;
  country?: string;
  currency?: string;
  now?: () => Date;
  random?: () => number;
};

type RpcResponse = {
  error?: {
    code?: number;
    message?: string;
    data?: { code?: string; content?: string };
  };
  result?: {
    isError?: boolean;
    structuredContent?: unknown;
    content?: { type?: string; text?: string }[];
  };
};

export type ShopifyResult = { source: Snapshot; products: NormalizedProduct[] };

export function createShopifyCatalog(opts: ShopifyOptions) {
  if (!/^https:\/\//.test(opts.agentProfileUrl)) {
    throw new SourceError(
      LABEL,
      "not_configured",
      "SHOPIFY_AGENT_PROFILE_URL must be a public https URL",
    );
  }
  const endpoint = opts.endpoint ?? SHOPIFY_CATALOG_MCP;
  const maxRetries = opts.maxRetries ?? 2;
  const now = () => opts.now?.() ?? new Date();
  const random = opts.random ?? Math.random;
  let rpcId = 0;

  async function callTool(
    name: string,
    catalog: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<{ source: Snapshot; content: unknown }> {
    const args = {
      meta: { "ucp-agent": { profile: opts.agentProfileUrl } },
      catalog,
    };
    const key = `${endpoint}#${name}:${await sha256Hex(canonicalize(catalog))}`;
    const source = await cachedFetch(
      {
        key,
        sourceType: "shopify_ucp",
        ttlMs: opts.cacheTtlMs ?? LISTING_TTL_MS,
        now,
        fetch: async () => {
          for (let attempt = 0; ; attempt++) {
            const res = await httpRequest({
              source: LABEL,
              url: endpoint,
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
              },
              body: JSON.stringify({
                jsonrpc: "2.0",
                id: ++rpcId,
                method: "tools/call",
                params: { name, arguments: args },
              }),
              ...(opts.fetch ? { fetch: opts.fetch } : {}),
              ...(opts.timeoutMs ? { timeoutMs: opts.timeoutMs } : {}),
              ...(signal ? { signal } : {}),
              now,
            });
            if (res.status !== 429 && res.status !== 503) return res;
            const wait =
              retryAfterMs(res.headers, now()) ??
              500 * 2 ** attempt * (0.5 + random());
            if (attempt >= maxRetries)
              throw new SourceError(
                LABEL,
                "rate_limited",
                "rate limited",
                res.status,
                wait,
              );
            await sleep(Math.min(wait, 5_000), signal);
          }
        },
      },
      opts.store,
    );
    if ((source.httpStatus ?? 0) >= 400)
      throw new SourceError(
        LABEL,
        "http",
        `HTTP ${source.httpStatus}`,
        source.httpStatus ?? undefined,
      );
    const rpc = parseJsonBody(LABEL, source.bytes) as RpcResponse;
    if (rpc.error) {
      const detail =
        rpc.error.data?.content ?? rpc.error.message ?? "JSON-RPC error";
      throw new SourceError(
        LABEL,
        rpc.error.data?.code === "profile_unreachable"
          ? "not_configured"
          : "invalid_response",
        detail,
      );
    }
    const result = rpc.result;
    if (!result || result.isError) {
      throw new SourceError(
        LABEL,
        "invalid_response",
        result?.content?.[0]?.text ?? "tool call failed",
      );
    }
    let content = result.structuredContent;
    if (content === undefined) {
      const text = result.content?.find((c) => c.type === "text")?.text;
      try {
        content = text ? JSON.parse(text) : undefined;
      } catch {
        content = undefined;
      }
    }
    if (typeof content !== "object" || content === null)
      throw new SourceError(LABEL, "invalid_response", "no structured content");
    return { source, content };
  }

  const context = () => ({
    address_country: opts.country ?? "US",
    currency: opts.currency ?? "USD",
  });
  const products = (content: unknown): UcpProduct[] => {
    const c = content as { products?: unknown; product?: unknown };
    const list = Array.isArray(c.products)
      ? c.products
      : c.product
        ? [c.product]
        : [];
    return list.filter(
      (p): p is UcpProduct =>
        typeof p === "object" &&
        p !== null &&
        typeof (p as UcpProduct).id === "string",
    );
  };

  return {
    label: LABEL,
    async search(
      query: string,
      page: { limit?: number; signal?: AbortSignal } = {},
    ): Promise<ShopifyResult> {
      const { source, content } = await callTool(
        "search_catalog",
        {
          query: query.trim().slice(0, 200),
          context: context(),
          pagination: { limit: page.limit ?? 10 },
        },
        page.signal,
      );
      return {
        source,
        products: products(content).map((p) =>
          normalizeUcpProduct(p, source.fetchedAt),
        ),
      };
    },
    async getProduct(id: string, signal?: AbortSignal): Promise<ShopifyResult> {
      const { source, content } = await callTool(
        "get_product",
        { id, context: context() },
        signal,
      );
      return {
        source,
        products: products(content).map((p) =>
          normalizeUcpProduct(p, source.fetchedAt),
        ),
      };
    },
    async lookup(
      ids: readonly string[],
      signal?: AbortSignal,
    ): Promise<ShopifyResult> {
      const { source, content } = await callTool(
        "lookup_catalog",
        { ids: [...ids], context: context() },
        signal,
      );
      return {
        source,
        products: products(content).map((p) =>
          normalizeUcpProduct(p, source.fetchedAt),
        ),
      };
    },
  };
}

/**
 * Cartel's UCP platform profile, served at `/.well-known/ucp`. Shopify
 * fetches it on every catalog call to check the version and capabilities.
 */
export function ucpAgentProfile(opts: { keys?: readonly object[] } = {}) {
  const cap = (name: string, path: string) => [
    {
      version: UCP_VERSION,
      spec: `https://ucp.dev/${UCP_VERSION}/specification/shopping/catalog/${path}`,
      schema: `https://ucp.dev/${UCP_VERSION}/schemas/shopping/${name}.json`,
    },
  ];
  return {
    ucp: {
      version: UCP_VERSION,
      services: {
        "dev.ucp.shopping": [
          {
            version: UCP_VERSION,
            spec: `https://ucp.dev/${UCP_VERSION}/specification/overview`,
            transport: "mcp",
            schema: `https://ucp.dev/${UCP_VERSION}/services/shopping/mcp.openrpc.json`,
          },
        ],
      },
      capabilities: {
        "dev.ucp.shopping.cart": [{ version: UCP_VERSION }],
        "dev.ucp.shopping.checkout": [{ version: UCP_VERSION }],
        "dev.ucp.shopping.catalog.search": cap("catalog_search", "search"),
        "dev.ucp.shopping.catalog.lookup": cap("catalog_lookup", "lookup"),
      },
      payment_handlers: {},
    },
    ...(opts.keys?.length ? { keys: [...opts.keys] } : {}),
  };
}
