import { searchStream } from "@cartel/catalog";
import { CatalogError } from "@cartel/catalog/supabase";
import {
  activeRequirements,
  apiError,
  catalogProviders,
  catalogReady,
} from "@/lib/catalog";
import { ALL_PACKS } from "@/lib/evidence";
import { limitCurrentRequest, tooManyRequests } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const query = (url.searchParams.get("q") ?? "").trim();
    const limit = Number(url.searchParams.get("limit") ?? "20");
    if (
      !query ||
      query.length > 200 ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 50
    )
      throw new CatalogError("invalid_search", 400);
    catalogReady();
    const quota = await limitCurrentRequest("search");
    if (!quota.allowed) return tooManyRequests(quota.retryAfterMs);
    const requirements = await activeRequirements(url);
    return new Response(
      searchStream({
        query,
        limit,
        requirements,
        packs: ALL_PACKS,
        providers: catalogProviders(),
        signal: request.signal,
      }),
      {
        headers: {
          "Content-Type": "application/x-ndjson; charset=utf-8",
          "Cache-Control": "private, no-store, no-transform",
          "X-Accel-Buffering": "no",
        },
      },
    );
  } catch (error) {
    return apiError(error);
  }
}
