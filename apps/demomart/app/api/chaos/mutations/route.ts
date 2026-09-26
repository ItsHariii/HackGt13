import { forbidden, isAdminRequest } from "@/lib/admin";
import { MutationRequest, mutationError } from "@/lib/chaos";
import { logger } from "@/lib/logger";
import { db } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!(await isAdminRequest(request))) return forbidden();
  const parsed = MutationRequest.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return Response.json(
      { error: "invalid_request", message: parsed.error.issues[0]?.message },
      { status: 400 },
    );
  }
  const { mutation, sku, params } = parsed.data;
  const { data, error } = await db().rpc("apply_mutation", {
    p_mutation: mutation,
    p_sku: sku,
    p_params: params,
    p_actor: "chaos-panel",
  });
  if (error) {
    const mapped = mutationError(error.message);
    logger.warn({ mutation, sku, err: error.message }, "mutation rejected");
    return Response.json(
      {
        error: error.message,
        message: mapped.message,
        detail: error.details || null,
      },
      { status: mapped.status },
    );
  }
  logger.info({ mutation, sku, logId: data?.id }, "chaos mutation applied");
  return Response.json({ entry: data }, { status: 201 });
}
