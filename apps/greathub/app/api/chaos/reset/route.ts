import { forbidden, isAdminRequest } from "@/lib/admin";
import { mutationError } from "@/lib/chaos";
import { logger } from "@/lib/logger";
import { db } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** Restore the seeded catalog: prices, specs, sellers, policies; clears recalls. */
export async function POST(request: Request) {
  if (!(await isAdminRequest(request))) return forbidden();
  const { data, error } = await db().rpc("reset_catalog", {
    p_actor: "chaos-panel",
  });
  if (error) {
    const mapped = mutationError(error.message);
    return Response.json(
      { error: error.message, message: mapped.message },
      { status: mapped.status },
    );
  }
  logger.info({ logId: data?.id }, "catalog reset");
  return Response.json({ entry: data }, { status: 201 });
}
