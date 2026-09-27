"use server";
import { Address } from "@cartel/acp";
import { AutonomyPreset } from "@cartel/contracts";
import { redirect } from "next/navigation";
import { userId } from "@/lib/catalog";
import { ContractDraftError, draftContract } from "@/lib/contract-draft";
import { logger } from "@/lib/logger";
import { limitCurrentRequest } from "@/lib/rate-limit";

export type DraftState = { error: string | null };

const MESSAGE: Record<string, string> = {
  not_found: "This plan isn't yours or no longer exists.",
  not_solved: "This plan changed since it was solved. Find plans again first.",
  merchant_unavailable:
    "GreatHub didn't answer, so no contract was drafted. Nothing was bought. Try again in a moment.",
  rule_fails:
    "GreatHub's checkout now fails a hard rule for this plan. Nothing was drafted; find plans again.",
  unwaived:
    "A hard rule can't be checked right now. Accept it as can't check below, or edit the rules.",
  over_budget:
    "GreatHub's checkout total is now over your budget. Nothing was drafted; find plans again.",
  changed:
    "Another contract version was drafted at the same time. Reload and try again.",
  storage: "The contract couldn't be saved. Nothing was signed. Try again.",
};

/** Drafts the contract for the chosen plan (TASKS T11.6), then opens it for signing. */
export async function draftContractAction(
  planId: string,
  _prev: DraftState,
  form: FormData,
): Promise<DraftState> {
  const field = (k: string) => String(form.get(k) ?? "").trim();
  const address = Address.safeParse({
    name: field("name"),
    line_one: field("line_one"),
    ...(field("line_two") ? { line_two: field("line_two") } : {}),
    city: field("city"),
    state: field("state").toUpperCase(),
    postal_code: field("postal_code"),
    country: field("country").toUpperCase() || "US",
  });
  if (!address.success)
    return {
      error: "Check the shipping address: every line but line 2 is needed.",
    };
  const preset = AutonomyPreset.safeParse(field("preset"));
  const label = field("plan");
  if (!preset.success || !/^[A-Z]$/.test(label))
    return { error: "Pick how much Cartel may change on its own." };
  const quota = await limitCurrentRequest("solve");
  if (!quota.allowed)
    return {
      error: `Too many drafts in a row. Try again in ${Math.ceil(quota.retryAfterMs / 1000)} seconds.`,
    };
  try {
    await draftContract({
      planId,
      label,
      owner: await userId(),
      address: address.data,
      preset: preset.data,
      waive: form.getAll("waive").map(String),
    });
  } catch (err) {
    if (err instanceof ContractDraftError)
      return { error: MESSAGE[err.code] ?? (MESSAGE.storage as string) };
    logger.error({ err }, "contract draft failed");
    return { error: MESSAGE.storage as string };
  }
  redirect(`/plans/${planId}/contract`);
}
