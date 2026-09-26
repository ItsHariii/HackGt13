import "server-only";
import { FLAGSHIP_PACKS, flagshipV7 } from "@cartel/rule-packs/fixtures";
import { buildWorkspace, type WorkspaceView } from "./workspace";

/** The demo plan id; served from the flagship fixtures (SDD §16.1). */
export const FLAGSHIP_PLAN = "flagship";

/**
 * The workspace for a plan. The flagship demo plan is the v7 basket from
 * the Zod fixtures, proved by the real engine (TASKS Phase 11: screens run
 * on fixtures first). Stored plans need a basket → engine-input loader,
 * which lands with the plan-proof wiring; until then they return null.
 */
export async function loadWorkspace(
  planId: string,
): Promise<WorkspaceView | null> {
  if (planId !== FLAGSHIP_PLAN) return null;
  const v7 = await flagshipV7();
  return buildWorkspace({
    planId,
    title: "Home office",
    path: `/plans/${planId}`,
    planLabel: "Plan A · Balanced",
    requirements: v7.contract.requirements,
    checkout: v7.snapshot,
    report: v7.report,
    packs: FLAGSHIP_PACKS,
    waivers: v7.contract.waivers,
  });
}
