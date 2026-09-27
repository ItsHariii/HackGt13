import "server-only";
import { catalogReady, UUID } from "./catalog";
import { demoProduct } from "./demo-catalog";
import { createAdminClient } from "./supabase/admin";

/** Checkout-proven offers name their product by the GTIN that ships (`checkout-proof.ts`). */
const GTIN_ID = /^product:(\d{8,14})$/;

/**
 * Product photos by product ID, for plan lines. Demo `dm_…` products come
 * from the fixtures; catalog products, named by row ID or `product:{gtin}`,
 * from `products.image_url`. A photo is decoration: a missing one, or an
 * unreachable catalog, leaves it out.
 */
export async function productImages(
  productIds: readonly string[],
): Promise<Map<string, string>> {
  const images = new Map<string, string>();
  const ids: string[] = [];
  const gtins: string[] = [];
  for (const id of new Set(productIds)) {
    const demo = demoProduct(id);
    const gtin = GTIN_ID.exec(id)?.[1];
    if (demo) {
      if (demo.imageUrl) images.set(id, demo.imageUrl);
    } else if (UUID.test(id)) ids.push(id);
    else if (gtin) gtins.push(gtin);
  }
  if (ids.length === 0 && gtins.length === 0) return images;
  try {
    catalogReady();
    const db = createAdminClient(AbortSignal.timeout(3000));
    const [byId, byGtin] = await Promise.all([
      ids.length > 0
        ? db.from("products").select("id, image_url").in("id", ids)
        : null,
      gtins.length > 0
        ? db
            .from("products")
            .select("gtin, image_url")
            .in("gtin", gtins)
            .not("image_url", "is", null)
        : null,
    ]);
    for (const row of byId?.data ?? [])
      if (row.image_url) images.set(row.id, row.image_url);
    for (const row of byGtin?.data ?? []) {
      const id = `product:${row.gtin}`;
      if (row.image_url && !images.has(id)) images.set(id, row.image_url);
    }
  } catch {
    // Plans still render; lines without a photo keep the placeholder.
  }
  return images;
}
