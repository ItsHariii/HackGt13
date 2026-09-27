"use server";
import { FLAGSHIP_BRIEF } from "@cartel/contracts/fixtures";
import { redirect } from "next/navigation";
import { detectPack, PACK_TITLE, type PackId } from "@/lib/pack-detect";
import { createStoredPlan, PlanError } from "@/lib/plans";
import { FLAGSHIP_PLAN } from "@/lib/workspace-data";

export type CreatePlanState = { error: string | null; brief: string };

const MAX = 2000;

/**
 * createPlan (TASKS T11.1). The flagship brief opens the demo plan; any
 * other brief is saved as a new plan under the visitor's session and opens
 * its requirements. Nothing is bought here.
 */
export async function createPlan(
  _prev: CreatePlanState,
  form: FormData,
): Promise<CreatePlanState> {
  const brief = String(form.get("brief") ?? "").trim();
  const chosen = String(form.get("pack") ?? "");
  if (!brief) return { error: "Write a few words about what you need.", brief };
  if (brief.length > MAX)
    return {
      error: `That's ${brief.length} characters. Keep it under ${MAX.toLocaleString("en-US")}.`,
      brief,
    };
  if (brief === FLAGSHIP_BRIEF)
    redirect(`/plans/${FLAGSHIP_PLAN}/requirements`);
  const pack = chosen in PACK_TITLE ? (chosen as PackId) : detectPack(brief);
  let id: string;
  try {
    id = await createStoredPlan({ brief, pack });
  } catch (e) {
    const code = e instanceof PlanError ? e.code : "storage";
    return {
      brief,
      error:
        code === "not_configured"
          ? "Saving a new plan needs the Cartel database, which isn't connected here. The Home office template opens the demo plan."
          : code === "no_session"
            ? "Your session hasn't started yet. Reload the page and try again."
            : "The plan couldn't be saved. Nothing was bought. Try again.",
    };
  }
  redirect(`/plans/${id}/requirements`);
}
