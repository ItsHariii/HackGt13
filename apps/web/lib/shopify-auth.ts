import "server-only";
import { createShopifyTokenSource, type ShopifyToken } from "@cartel/evidence";

/*
 * Cartel's Shopify agent token (TASKS T7.5, T13.10): from Dev Dashboard
 * client credentials when set, renewed before its 60 minutes run out; a
 * static SHOPIFY_ACCESS_TOKEN still works for local testing. Null means
 * keyless catalog access and no hand-off.
 */

let source: ShopifyToken | null | undefined;

export function shopifyToken(): ShopifyToken | null {
  if (source !== undefined) return source;
  const id = process.env.SHOPIFY_CLIENT_ID?.trim();
  const secret = process.env.SHOPIFY_CLIENT_SECRET?.trim();
  const fixed = process.env.SHOPIFY_ACCESS_TOKEN?.trim();
  source =
    id && secret
      ? createShopifyTokenSource({ clientId: id, clientSecret: secret })
      : fixed
        ? async () => fixed
        : null;
  return source;
}
