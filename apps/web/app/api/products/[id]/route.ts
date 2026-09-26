import { productProof, specRows } from "@cartel/catalog";
import { CatalogError, loadProducts } from "@cartel/catalog/supabase";
import {
  activeRequirements,
  apiError,
  catalogReady,
  jsonResponse,
  transientProduct,
  UUID,
} from "@/lib/catalog";
import { ALL_PACKS } from "@/lib/evidence";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    if (!UUID.test(id) && !id.startsWith("shopify:"))
      throw new CatalogError("invalid_product_id", 400);
    catalogReady();
    const requirements = await activeRequirements(new URL(request.url));
    const product = id.startsWith("shopify:")
      ? await transientProduct(id, request.signal)
      : (
          await loadProducts(
            createAdminClient(request.signal),
            [id],
            undefined,
            request.signal,
          )
        )[0];
    if (!product) throw new CatalogError("product_not_found", 404);
    const now = new Date().toISOString();
    return jsonResponse({
      ...product,
      proof: productProof(product, requirements, ALL_PACKS, now),
      specs: specRows(product, ALL_PACKS, now),
      evaluatedAt: now,
      proofScope: "item",
    });
  } catch (error) {
    return apiError(error);
  }
}
