import { authenticateAgent } from "@/lib/agent-auth";
import {
  getCartVariants,
  getProduct,
  getStorePolicies,
  type VariantView,
} from "@/lib/catalog";
import { merchantOrigin } from "@/lib/config";

export const dynamic = "force-dynamic";

function variantFacts(v: VariantView, url: string, shippingFlatMinor: number) {
  const o = v.offer;
  return {
    sku: v.sku,
    gtin: v.gtin,
    mpn: v.mpn,
    title: v.title,
    option: v.optionLabel,
    url,
    spec: v.spec,
    offer: {
      id: o.id,
      revision: o.revision,
      price_minor: o.priceMinor,
      currency: o.currency,
      availability: o.availability,
      stock: o.stock,
      seller: o.seller,
      delivery: { min_days: o.deliveryMinDays, max_days: o.deliveryMaxDays },
      shipping_minor: shippingFlatMinor + o.shippingFeeMinor,
      final_sale: o.finalSale,
      return_policy: {
        id: o.returnPolicy.id,
        name: o.returnPolicy.name,
        ...o.returnPolicy.terms,
      },
      pack_size: o.packSize,
      subscription: o.subscription,
      updated_at: o.updatedAt,
    },
    ships_as: v.shipsAs,
  };
}

/**
 * Signed agent read of product facts (T6.2). Accepts a SKU or a product slug.
 * Returns the visible spec (what the page shows), not the JSON-LD.
 */
export async function GET(
  request: Request,
  ctx: RouteContext<"/api/products/[id]">,
) {
  const auth = await authenticateAgent(request, "", ["agent-browser-auth"]);
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  const origin = merchantOrigin(request);
  const headers = {
    "Cache-Control": "no-store",
    "Request-Id": auth.agent.requestId,
  };
  const { shipping } = await getStorePolicies();

  const bySku = (await getCartVariants([id])).get(id);
  if (bySku) {
    const url = `${origin}/p/${bySku.product.slug}?sku=${encodeURIComponent(bySku.sku)}`;
    return Response.json(
      {
        product: {
          slug: bySku.product.slug,
          brand: bySku.product.brand,
          name: bySku.product.name,
          category: bySku.product.category,
        },
        variants: [variantFacts(bySku, url, shipping.flatMinor)],
        retrieved_at: new Date().toISOString(),
      },
      { headers },
    );
  }
  const product = /^[a-z0-9-]{1,120}$/.test(id) ? await getProduct(id) : null;
  if (!product) {
    return Response.json(
      {
        type: "invalid_request",
        code: "not_found",
        message: "No such product.",
      },
      { status: 404, headers },
    );
  }
  const { variants, ...summary } = product;
  return Response.json(
    {
      product: summary,
      variants: variants.map((v) =>
        variantFacts(
          v,
          `${origin}/p/${product.slug}?sku=${encodeURIComponent(v.sku)}`,
          shipping.flatMinor,
        ),
      ),
      retrieved_at: new Date().toISOString(),
    },
    { headers },
  );
}
