import { forbidden, isAdminRequest } from "@/lib/admin";
import { mutationError, SCENARIOS } from "@/lib/chaos";
import { logger } from "@/lib/logger";
import { db } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** Every step of a scenario applies in one transaction, or none do. */
export async function POST(
  request: Request,
  ctx: RouteContext<"/api/chaos/scenarios/[name]">,
) {
  if (!(await isAdminRequest(request))) return forbidden();
  const { name } = await ctx.params;
  const scenario = SCENARIOS.find((s) => s.id === name);
  if (!scenario)
    return Response.json({ error: "unknown_scenario" }, { status: 404 });
  const { data, error } = await db().rpc("apply_scenario", {
    p_name: scenario.id,
    p_steps: scenario.steps as never,
    p_actor: "chaos-panel",
  });
  if (error) {
    const mapped = mutationError(error.message);
    return Response.json(
      {
        error: error.message,
        message: mapped.message,
        detail: error.details || null,
      },
      { status: mapped.status },
    );
  }
  logger.info(
    { scenario: scenario.id, steps: data?.length },
    "chaos scenario applied",
  );
  return Response.json(
    { scenario: scenario.id, entries: data },
    { status: 201 },
  );
}
