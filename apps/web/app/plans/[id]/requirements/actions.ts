"use server";
import { redirect } from "next/navigation";
import { PlanError, saveRequirementSet } from "@/lib/plans";

/** Saves the reviewed rules as a new requirement set, then opens the plan. */
export async function saveRequirements(
  planId: string,
  requirements: unknown,
): Promise<{ error: string }> {
  try {
    await saveRequirementSet(planId, requirements);
  } catch (e) {
    const code = e instanceof PlanError ? e.code : "storage";
    return {
      error:
        code === "invalid"
          ? "One of the rules isn't valid. Check the values and try again."
          : code === "no_session" || code === "not_configured"
            ? "Your session has ended. Reload the page to continue."
            : "The rules couldn't be saved. Try again.",
    };
  }
  redirect(`/plans/${planId}?solve=1`);
}
