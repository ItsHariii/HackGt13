import { parseMoney } from "@proofcart/proof-engine";
import { normalizeGtin } from "../claims";
import {
  type FetchLike,
  type HttpResponse,
  httpRequest,
  parseJsonBody,
  retryAfterMs,
  SourceError,
} from "../http";
import { cachedFetch, type Snapshot, type SnapshotStore } from "../snapshot";
import type {
  Availability,
  NormalizedOffer,
  NormalizedProduct,
} from "../types";
import { inferRoles } from "./roles";

/*
 * UPCitemdb (SDD §11.2, T7.9), replacing Best Buy. Keyless trial: 100
 * requests a day per IP, reported in `X-RateLimit-*` headers. A paid key
 * switches to `/prod/v1` with a `user_key` header.
 *
 * What it gives is identity (GTIN, brand, model, category, images) plus a
 * history of retailer listings. Those listings are reference prices, not
 * live checkout state: they become `reference_only` offers shown as "Seen at
 * Newegg $899.99 · last seen {date}" and never feed a price rule.
 */

const TRIAL = "https://api.upcitemdb.com/prod/trial";
const PAID = "https://api.upcitemdb.com/prod/v1";
const LABEL = "UPCitemdb";
/** Stop before the quota is gone so a demo query still has headroom. */
export const UPCITEMDB_RESERVE = 5;

export type UpcOffer = {
  merchant?: string;
  domain?: string;
  title?: string;
  currency?: string;
  price?: number | string;
  shipping?: string;
  condition?: string;
  availability?: string;
  link?: string;
  updated_t?: number;
};

export type UpcItem = {
  ean?: string;
  upc?: string;
  title?: string;
  description?: string;
  brand?: string;
  model?: string;
  color?: string;
  size?: string;
  dimension?: string;
  weight?: string;
  category?: string;
  images?: string[];
  offers?: UpcOffer[];
};

export type UpcResponse = {
  code?: string;
  message?: string;
  total?: number;
  offset?: number;
  items?: UpcItem[];
};

/** Quota shared by every call from this process (the limit is per IP). */
export type RateBudget = { remaining: number | null; resetAtMs: number | null };

export function newRateBudget(): RateBudget {
  return { remaining: null, resetAtMs: null };
}

const AVAILABILITY: [RegExp, Availability][] = [
  [/out of stock|sold out|unavailable/i, "out_of_stock"],
  [/limited|few left/i, "limited"],
  [/back ?order/i, "backorder"],
  [/pre-?order/i, "preorder"],
  [/discontinued/i, "discontinued"],
  [/in stock|available/i, "in_stock"],
];

function availability(text: string | undefined): Availability {
  if (!text) return "unknown";
  return AVAILABILITY.find(([re]) => re.test(text))?.[1] ?? "unknown";
}

async function shortHash(s: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(s),
  );
  return [...new Uint8Array(digest).slice(0, 6)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function https(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return undefined;
    u.protocol = "https:";
    return u.toString();
  } catch {
    return undefined;
  }
}

/** One UPCitemdb item as a normalized product. Items without a valid GTIN are skipped. */
export async function normalizeUpcItem(
  item: UpcItem,
): Promise<NormalizedProduct | null> {
  const gtin = normalizeGtin(item.ean) ?? normalizeGtin(item.upc);
  const title = item.title?.trim();
  if (!gtin || !title) return null;
  const offers: NormalizedOffer[] = [];
  for (const o of item.offers ?? []) {
    const currency = o.currency?.trim().toUpperCase() || "USD";
    const price =
      o.price === undefined || o.price === ""
        ? null
        : parseMoney(String(o.price), currency);
    if (!o.domain || !o.updated_t) continue;
    const seenAt = new Date(o.updated_t * 1000).toISOString();
    offers.push({
      // The link carries a per-request sequence number, so identity is GTIN + store + listing title.
      externalId: `${gtin}:${o.domain}:${await shortHash(o.title ?? "")}`,
      merchantId: o.domain,
      ...(o.merchant ? { sellerId: o.merchant } : {}),
      ...(o.title ? { title: o.title } : {}),
      ...(price && price.amountMinor > 0
        ? { priceMinor: price.amountMinor }
        : {}),
      currency,
      availability: availability(o.availability),
      ...(https(o.link) ? { url: https(o.link) as string } : {}),
      referenceOnly: true,
      // Observed then, and never fresh enough for a rule.
      retrievedAt: seenAt,
      freshUntil: seenAt,
    });
  }
  const attributes: Record<string, string> = {};
  for (const k of ["color", "size", "dimension", "weight"] as const) {
    const v = item[k]?.trim();
    if (v) attributes[k] = v;
  }
  const image = (item.images ?? []).map(https).find(Boolean);
  return {
    source: "upcitemdb",
    externalId: gtin,
    title,
    ...(item.brand?.trim() ? { brand: item.brand.trim() } : {}),
    gtin,
    ...(item.model?.trim() ? { mpn: item.model.trim() } : {}),
    ...(item.category?.trim() ? { category: item.category.trim() } : {}),
    roles: inferRoles(item.category, title),
    ...(image ? { imageUrl: image } : {}),
    attributes,
    offers,
    // UPCitemdb specs are free text; nothing here is structured enough to be a fact.
    facts: [],
  };
}

export type UpcItemDbOptions = {
  store: SnapshotStore;
  fetch?: FetchLike;
  /** Empty or unset: the keyless trial tier. */
  userKey?: string;
  budget?: RateBudget;
  /** Default 24 h; demo queries are pre-warmed into this cache. */
  cacheTtlMs?: number;
  timeoutMs?: number;
  now?: () => Date;
};

export type UpcResult = {
  source: Snapshot;
  total: number;
  products: NormalizedProduct[];
};

export function createUpcItemDb(opts: UpcItemDbOptions) {
  const key = opts.userKey?.trim();
  const base = key ? PAID : TRIAL;
  const budget = opts.budget ?? newRateBudget();
  const now = () => opts.now?.() ?? new Date();

  function recordBudget(res: HttpResponse) {
    const remaining = res.headers.get("x-ratelimit-remaining");
    const reset = res.headers.get("x-ratelimit-reset");
    if (remaining !== null && /^\d+$/.test(remaining))
      budget.remaining = Number(remaining);
    if (reset !== null && /^\d+$/.test(reset))
      budget.resetAtMs = Number(reset) * 1000;
  }

  async function call(path: string): Promise<UpcResult> {
    const url = `${base}/${path}`;
    const source = await cachedFetch(
      {
        key: url,
        sourceType: "upcitemdb",
        ttlMs: opts.cacheTtlMs ?? 86_400_000,
        now,
        fetch: async () => {
          const t = now().getTime();
          if (budget.resetAtMs !== null && t >= budget.resetAtMs) {
            budget.remaining = null;
            budget.resetAtMs = null;
          }
          if (
            budget.remaining !== null &&
            budget.remaining <= UPCITEMDB_RESERVE
          ) {
            throw new SourceError(
              LABEL,
              "rate_limited",
              `daily quota nearly used (${budget.remaining} left)`,
              429,
              budget.resetAtMs ? budget.resetAtMs - t : undefined,
            );
          }
          const res = await httpRequest({
            source: LABEL,
            url,
            headers: {
              Accept: "application/json",
              ...(key ? { user_key: key, key_type: "3scale" } : {}),
            },
            ...(opts.fetch ? { fetch: opts.fetch } : {}),
            ...(opts.timeoutMs ? { timeoutMs: opts.timeoutMs } : {}),
            now,
          });
          recordBudget(res);
          if (res.status === 429) {
            budget.remaining = 0;
            throw new SourceError(
              LABEL,
              "rate_limited",
              "rate limited",
              429,
              retryAfterMs(res.headers, now()),
            );
          }
          return res;
        },
      },
      opts.store,
    );
    const body = parseJsonBody(LABEL, source.bytes) as UpcResponse;
    if (
      source.httpStatus === 404 ||
      body.code === "INVALID_UPC" ||
      body.code === "NOT_FOUND"
    ) {
      return { source, total: 0, products: [] };
    }
    if (source.httpStatus !== 200 || body.code !== "OK") {
      throw new SourceError(
        LABEL,
        "http",
        body.message ?? body.code ?? `HTTP ${source.httpStatus}`,
        source.httpStatus ?? undefined,
      );
    }
    const products = (
      await Promise.all((body.items ?? []).map(normalizeUpcItem))
    ).filter((p): p is NormalizedProduct => p !== null);
    return { source, total: body.total ?? products.length, products };
  }

  return {
    label: LABEL,
    budget,
    search(query: string, page: { offset?: number } = {}): Promise<UpcResult> {
      const q = query.trim().slice(0, 200);
      const offset = page.offset ? `&offset=${page.offset}` : "";
      return call(
        `search?s=${encodeURIComponent(q)}&match_mode=0&type=product${offset}`,
      );
    },
    lookup(upc: string): Promise<UpcResult> {
      const digits = upc.replace(/\D/g, "");
      return call(`lookup?upc=${encodeURIComponent(digits)}`);
    },
  };
}
