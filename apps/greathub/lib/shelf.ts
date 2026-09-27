import type { ProductView } from "./catalog";
import { formatMinor } from "./money";

/*
 * How the catalog is shown: "list" is the commit-row file list beside the
 * About column; "full" drops the column and lays products out as cards
 * across the whole page. The choice rides on `?view=` and the proxy keeps
 * it in a cookie so search and topic links remember it.
 */
export const VIEW_COOKIE = "gh-view";
export const VIEWS = ["list", "full"] as const;
export type CatalogView = (typeof VIEWS)[number];

export function parseView(value: unknown): CatalogView | null {
  return typeof value === "string" &&
    (VIEWS as readonly string[]).includes(value)
    ? (value as CatalogView)
    : null;
}

export function priceLabel(p: ProductView): string {
  const prices = p.variants.map((v) => v.offer.priceMinor);
  const min = Math.min(...prices);
  return prices.some((x) => x !== min)
    ? `from ${formatMinor(min)}`
    : formatMinor(min);
}

export function stockOf(p: ProductView) {
  if (p.variants.every((v) => v.offer.availability === "out_of_stock"))
    return "out_of_stock" as const;
  if (p.variants.some((v) => v.offer.availability === "limited"))
    return "limited" as const;
  return "in_stock" as const;
}

export function unitsHeld(p: ProductView): number {
  return p.variants.reduce((n, v) => n + v.offer.stock, 0);
}
