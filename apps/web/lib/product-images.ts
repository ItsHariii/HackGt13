import "server-only";
import { catalogReady, UUID } from "./catalog";
import { demoProduct } from "./demo-catalog";
import { createAdminClient } from "./supabase/admin";

/**
 * Product photos by product ID, for plan lines. Demo `dm_…` products come
 * from the fixtures, catalog products from `products.image_url`. A photo is
 * decoration: a missing one, or an unreachable catalog, leaves it out.
 */
export async function productImages(
  productIds: readonly string[],
): Promise<Map<string, string>> {
  const images = new Map<string, string>();
  const catalog: string[] = [];
  for (const id of new Set(productIds)) {
    const demo = demoProduct(id);
    if (demo) {
      if (demo.imageUrl) images.set(id, demo.imageUrl);
    } else if (UUID.test(id)) catalog.push(id);
  }
  if (catalog.length === 0) return images;
  try {
    catalogReady();
    const { data } = await createAdminClient(AbortSignal.timeout(3000))
      .from("products")
      .select("id, image_url")
      .in("id", catalog);
    for (const row of data ?? [])
      if (row.image_url) images.set(row.id, row.image_url);
  } catch {
    // Plans still render; lines without a photo keep the placeholder.
  }
  return images;
}
