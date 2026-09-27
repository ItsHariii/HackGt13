"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { adoptLimits } from "@/lib/compare-adopt";
import { logger } from "@/lib/logger";
import { loadStoredPlan, saveRequirementSet } from "@/lib/plans";

const Input = z.strictObject({
  budget: z.number().int().min(100).max(100_000).optional(),
  by: z.iso.date().optional(),
  label: z.string().regex(/^[A-C]$/),
});

/**
 * "Use Plan X" (TASKS T11.5): the limits tried on Compare become the plan's
 * rules, then Find plans runs live and opens that plan's workspace.
 */
export async function choosePlan(planId: string, raw: unknown): Promise<void> {
  const input = Input.safeParse(raw);
  const plan = input.success ? await loadStoredPlan(planId) : null;
  if (!input.success || !plan) redirect(`/plans/${planId}/compare`);
  const { budget, by, label } = input.data;
  if (budget !== undefined || by !== undefined) {
    try {
      await saveRequirementSet(
        plan.id,
        adoptLimits(plan.requirements, { budget, by }),
      );
    } catch (err) {
      logger.warn({ err }, "compare limits not saved");
      redirect(`/plans/${planId}/compare?error=save`);
    }
  }
  redirect(`/plans/${plan.id}?solve=1&plan=${label}`);
}
