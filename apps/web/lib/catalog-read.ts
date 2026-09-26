import "server-only";
import type { CatalogProduct } from "@cartel/catalog";
import { loadProducts } from "@cartel/catalog/supabase";
import { catalogReady, transientProduct, UUID } from "./catalog";
import { demoProduct } from "./demo-catalog";
import { createAdminClient } from "./supabase/admin";

export type ProductLookup =
  | { status: "ok"; product: CatalogProduct; demo: boolean }
  | { status: "not_found" }
  | { status: "unavailable" };

/** A product by ID: demo `dm_…` IDs from the fixtures, others from the catalog. */
export async function findProduct(id: string): Promise<ProductLookup> {
  const demo = demoProduct(id);
  if (demo) return { status: "ok", product: demo, demo: true };
  if (!UUID.test(id) && !id.startsWith("shopify:"))
    return { status: "not_found" };
  try {
    catalogReady();
    const signal = AbortSignal.timeout(5000);
    const product = id.startsWith("shopify:")
      ? await transientProduct(id, signal)
      : (
          await loadProducts(createAdminClient(signal), [id], undefined, signal)
        )[0];
    return product
      ? { status: "ok", product, demo: false }
      : { status: "not_found" };
  } catch {
    return { status: "unavailable" };
  }
}

export function catalogConnected(): boolean {
  try {
    catalogReady();
    return true;
  } catch {
    return false;
  }
}
