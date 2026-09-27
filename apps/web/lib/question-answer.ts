import type { Requirement } from "@cartel/contracts";
import { manualRuleId, sameRule } from "./manual-rule";

/*
 * Answering an A1 question in your own words (TASKS T11.2). The answer is
 * read by A1 as a follow-up to the brief; only rules the plan doesn't have
 * yet come back, so an answer never rewrites what the shopper already set.
 */

/** The brief A1 reads for an answer: the original text, then the question and answer. */
export function briefWithAnswer(
  brief: string,
  question: string,
  answer: string,
): string {
  return `${brief.trimEnd()}\n\nQ: ${question.trim()}\nA: ${answer.trim()}`;
}

/**
 * The rules an answer adds. A rule quoted from the answer is the shopper's
 * own choice (its words aren't in the stored brief, so it can't point at a
 * span there); duplicates of existing rules are dropped and ids stay unique.
 */
export function rulesFromAnswer(
  drafted: readonly Requirement[],
  current: readonly Requirement[],
  briefLength: number,
): Requirement[] {
  const out: Requirement[] = [];
  const ids = current.map((r) => r.id);
  for (const r of drafted) {
    if (sameRule([...current, ...out], r)) continue;
    const p = r.provenance;
    // Quotes from the original brief restate rules the draft already made.
    if (p.kind === "user_stated" && p.span[0] < briefLength) continue;
    const id = manualRuleId(r.field, ids);
    ids.push(id);
    out.push({
      ...r,
      id,
      provenance:
        p.kind === "user_stated"
          ? { kind: "user_selected", via: "form", label: `“${p.quote}”` }
          : p,
    });
  }
  return out;
}
