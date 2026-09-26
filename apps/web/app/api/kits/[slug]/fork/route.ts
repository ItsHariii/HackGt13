import { CatalogError, forkKit } from "@proofcart/catalog/supabase";
import { apiError, catalogReady, jsonResponse, userId } from "@/lib/catalog";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  try {
    const origin = request.headers.get("origin");
    let suppliedOrigin: URL | null = null;
    try {
      suppliedOrigin = origin ? new URL(origin) : null;
    } catch {}
    // Next can normalize request.url's hostname to localhost when a proxy is in
    // front. The browser's Host header retains the actual request authority.
    if (
      !suppliedOrigin ||
      suppliedOrigin.origin !== origin ||
      suppliedOrigin.host !== request.headers.get("host") ||
      suppliedOrigin.protocol !== new URL(request.url).protocol
    )
      throw new CatalogError("origin_not_allowed", 403);
    const { slug } = await context.params;
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 100)
      throw new CatalogError("invalid_kit_slug", 400);
    catalogReady();
    const owner = await userId();
    return jsonResponse(await forkKit(createAdminClient(), slug, owner), 201);
  } catch (error) {
    return apiError(error);
  }
}
