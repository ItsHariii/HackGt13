"use server";
import { draftRequirements } from "@cartel/ai";
import { Requirement } from "@cartel/contracts";
import { redirect } from "next/navigation";
import { z } from "zod";
import { aiRouter } from "@/lib/ai";
import { aiFailure } from "@/lib/ai-failure";
import { ALL_PACKS } from "@/lib/evidence";
import { logger } from "@/lib/logger";
import { loadStoredPlan, PlanError, saveRequirementSet } from "@/lib/plans";
import { briefWithAnswer, rulesFromAnswer } from "@/lib/question-answer";
import { limitCurrentRequest } from "@/lib/rate-limit";

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

const AnswerInput = z.object({
  question: z.string().trim().min(1).max(200),
  answer: z.string().trim().min(1).max(300),
  rules: z.array(Requirement).max(80),
});

export type AnswerResult =
  | { ok: true; added: Requirement[] }
  | { ok: false; error: string; aiOff?: true };

/**
 * An open question answered in the shopper's words: A1 reads the brief plus
 * the answer and returns only rules the plan doesn't have yet. Nothing is
 * saved; the rules join the page like any draft.
 */
export async function answerQuestion(
  planId: string,
  input: unknown,
): Promise<AnswerResult> {
  const parsed = AnswerInput.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: "Write a short answer first." };
  const plan = await loadStoredPlan(planId);
  if (!plan) return { ok: false, error: "This plan isn't available." };
  const router = aiRouter();
  if (!router.available())
    return {
      ok: false,
      aiOff: true,
      error: "The AI is off. Add the rule by hand below.",
    };
  const quota = await limitCurrentRequest("ai");
  if (!quota.allowed)
    return {
      ok: false,
      error: "Too many requests. Wait a moment and try again.",
    };
  const { question, answer, rules } = parsed.data;
  try {
    const drafted = await draftRequirements(router, {
      brief: briefWithAnswer(plan.brief, question, answer),
      packs: plan.packs.length ? plan.packs : ALL_PACKS,
      planId: plan.id,
      today: new Date().toISOString().slice(0, 10),
    });
    return {
      ok: true,
      added: rulesFromAnswer(
        drafted.requirements,
        rules,
        plan.brief.trimEnd().length,
      ),
    };
  } catch (error) {
    const reason = aiFailure(error) ?? "unavailable";
    if (reason === "unavailable")
      logger.warn({ err: error }, "question answer failed");
    return {
      ok: false,
      ...(reason === "off" ? { aiOff: true as const } : {}),
      error:
        reason === "off"
          ? "The AI is off. Add the rule by hand below."
          : "I couldn't read that answer right now. Add the rule by hand below.",
    };
  }
}
