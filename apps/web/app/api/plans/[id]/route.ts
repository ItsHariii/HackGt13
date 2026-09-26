import { CatalogError, loadPlan } from "@cartel/catalog/supabase";
import {
  apiError,
  catalogReady,
  jsonResponse,
  UUID,
  userId,
} from "@/lib/catalog";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    if (!UUID.test(id)) throw new CatalogError("invalid_plan_id", 400);
    catalogReady();
    const owner = await userId();
    return jsonResponse(await loadPlan(createAdminClient(), id, owner));
  } catch (error) {
    return apiError(error);
  }
}
