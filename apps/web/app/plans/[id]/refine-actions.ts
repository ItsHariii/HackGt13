"use server";
import { refineRequirements } from "@cartel/ai";
import { RequirementPatch } from "@cartel/contracts";
import { aiRouter } from "@/lib/ai";
import { aiFailure } from "@/lib/ai-failure";
import { ALL_PACKS } from "@/lib/evidence";
import { logger } from "@/lib/logger";
import { solveStoredPlan } from "@/lib/plan-solve";
import { loadStoredPlan, saveRequirementSet } from "@/lib/plans";
import { limitCurrentRequest } from "@/lib/rate-limit";
import { applyPatches, type DiffLine, diffLines } from "@/lib/refine";

export type RefinePreview =
  | {
      status: "ok";
      patches: RequirementPatch[];
      lines: DiffLine[];
      unhandled: string[];
      /** The rule set the patches were written against. */
      setVersion: number;
    }
  | { status: "error"; message: string; manual?: boolean };

/** A4: the command as a rule diff. Nothing changes until the shopper confirms. */
export async function previewRefinement(
  planId: string,
  command: string,
): Promise<RefinePreview> {
  const text = command.trim();
  if (!text || text.length > 500)
    return { status: "error", message: "Write the change in a sentence." };
  const plan = await loadStoredPlan(planId);
  if (!plan) return { status: "error", message: "This plan isn't yours." };
  const router = aiRouter();
  if (!router.available())
    return {
      status: "error",
      manual: true,
      message: "The AI is off. Change the rules by hand instead.",
    };
  const quota = await limitCurrentRequest("ai");
  if (!quota.allowed)
    return {
      status: "error",
      message: `Too many requests in a row. Try again in ${Math.ceil(quota.retryAfterMs / 1000)} seconds.`,
    };
  const packs = plan.packs.length > 0 ? plan.packs : ALL_PACKS;
  try {
    const result = await refineRequirements(router, {
      command: text,
      requirements: plan.requirements,
      packs,
      planId: plan.id,
    });
    return {
      status: "ok",
      patches: result.patches,
      lines: diffLines(plan.requirements, result.patches, packs),
      unhandled: result.unhandled,
      setVersion: plan.setVersion,
    };
  } catch (err) {
    const reason = aiFailure(err);
    if (!reason) logger.warn({ err }, "refinement failed");
    return {
      status: "error",
      manual: true,
      message:
        reason === "off"
          ? "The AI is off. Change the rules by hand instead."
          : "The AI didn't answer. Change the rules by hand, or try again.",
    };
  }
}

export type ApplyResult =
  | { status: "ok"; solved: boolean }
  | { status: "error"; message: string };

/** Saves the confirmed patches as the next rule set, then finds plans again. */
export async function applyRefinement(
  planId: string,
  setVersion: number,
  raw: unknown,
): Promise<ApplyResult> {
  const patches = RequirementPatch.array().max(20).safeParse(raw);
  if (!patches.success)
    return { status: "error", message: "That change isn't valid anymore." };
  const plan = await loadStoredPlan(planId);
  if (!plan) return { status: "error", message: "This plan isn't yours." };
  if (plan.setVersion !== setVersion)
    return {
      status: "error",
      message: "The rules changed since this preview. Ask again.",
    };
  const next = applyPatches(plan.requirements, patches.data);
  if (next.length === 0)
    return { status: "error", message: "That would remove every rule." };
  try {
    await saveRequirementSet(plan.id, next);
  } catch (err) {
    logger.warn({ err }, "refinement not saved");
    return { status: "error", message: "The new rules couldn't be saved." };
  }
  const quota = await limitCurrentRequest("solve");
  if (!quota.allowed) return { status: "ok", solved: false };
  try {
    const outcome = await solveStoredPlan(plan.id);
    return { status: "ok", solved: outcome.status === "solved" };
  } catch (err) {
    logger.error({ err }, "re-solve after refinement failed");
    return { status: "ok", solved: false };
  }
}
