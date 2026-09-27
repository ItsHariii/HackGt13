"use server";
import { redirect } from "next/navigation";
import { logger } from "@/lib/logger";
import { solveStoredPlan } from "@/lib/plan-solve";
import { limitCurrentRequest } from "@/lib/rate-limit";

export type SolveState = { error: string | null };

const MESSAGE: Record<string, string> = {
  not_found: "This plan isn't yours or no longer exists.",
  no_rules: "Add at least one rule first.",
  merchant_unavailable:
    "GreatHub didn't answer, so no plan was priced. Nothing was bought. Try again in a moment.",
  no_candidates:
    "GreatHub doesn't sell anything for these rules yet. Edit the rules or search products.",
  storage: "The plans couldn't be saved. Nothing was bought. Try again.",
};

/** Find plans (TASKS T11.3): solve, quote and prove, then open the workspace. */
export async function solvePlan(
  planId: string,
  _prev: SolveState,
): Promise<SolveState> {
  const quota = await limitCurrentRequest("solve");
  if (!quota.allowed)
    return {
      error: `Too many searches in a row. Try again in ${Math.ceil(quota.retryAfterMs / 1000)} seconds.`,
    };
  let outcome: Awaited<ReturnType<typeof solveStoredPlan>>;
  try {
    outcome = await solveStoredPlan(planId);
  } catch (err) {
    logger.error({ err }, "plan solve failed");
    return { error: MESSAGE.storage as string };
  }
  if (outcome.status === "solved") redirect(`/plans/${planId}`);
  if (outcome.status === "infeasible") redirect(`/plans/${planId}/compare`);
  return { error: MESSAGE[outcome.code] ?? (MESSAGE.storage as string) };
}
