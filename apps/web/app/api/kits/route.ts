import { apiError, catalogReady, jsonResponse } from "@/lib/catalog";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export async function GET() {
  try {
    catalogReady();
    const { data, error } = await createAdminClient()
      .from("kits")
      .select("*, kit_requirements(*), kit_items(*)")
      .order("sort_order");
    if (error) throw error;
    return jsonResponse({ kits: data });
  } catch (error) {
    return apiError(error);
  }
}
