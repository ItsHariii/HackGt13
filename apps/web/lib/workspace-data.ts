import "server-only";
import { FLAGSHIP_PACKS, flagshipV7 } from "@cartel/rule-packs/fixtures";
import { productImages } from "./product-images";
import { loadStoredSolve } from "./stored-workspace";
import { buildWorkspace, type WorkspaceView } from "./workspace";

/** The demo plan id; served from the flagship fixtures (SDD §16.1). */
export const FLAGSHIP_PLAN = "flagship";

/**
 * The workspace for a plan. The flagship demo plan is the v7 basket from
 * the Zod fixtures, proved by the real engine (TASKS Phase 11). A saved
 * plan shows its latest solve (lib/stored-workspace.ts), with `label`
 * picking Plan A, B or C; null until it has been solved.
 */
export async function loadWorkspace(
  planId: string,
  label?: string,
): Promise<WorkspaceView | null> {
  if (planId !== FLAGSHIP_PLAN) {
    const solve = await loadStoredSolve(planId, label);
    return solve?.kind === "solved" ? solve.view : null;
  }
  const v7 = await flagshipV7();
  const images = await productImages(
    v7.snapshot.offers.map((o) => o.productId),
  );
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
    images,
  });
}
