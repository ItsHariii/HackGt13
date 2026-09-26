import type { Pack } from "@proofcart/proof-engine";
import { ontologyFor } from "./ontology";
import { systemFor } from "./prompts";
import type { AiRunner, RunResult } from "./router";
import { type Summary, SummarySchema } from "./schemas";

/*
 * A5: explanations (SDD §10.1). The model only rewords. It is given the proof
 * report or consent diff as JSON plus the template sentence the product would
 * have shown anyway, and its answer is rejected if it contains a number that
 * is in neither. The UI labels the result "AI summary".
 */

/** Number-like tokens: `896.05`, `1,234`, `2026-09-28`, `90`. */
const NUMERIC = /\d[\d.,:/-]*\d|\d/g;

function normalizeNumber(token: string): string {
  return token.replace(/,/g, "").replace(/[.,:/-]+$/, "");
}

export function numbersIn(text: string): string[] {
  return (text.match(NUMERIC) ?? []).map(normalizeNumber).filter(Boolean);
}

/**
 * Every number in `text` must appear in one of the sources. Returns the ones
 * that do not, so the caller can log what the model invented.
 */
export function unsupportedNumbers(
  text: string,
  sources: readonly string[],
): string[] {
  const allowed = new Set(sources.flatMap(numbersIn));
  return numbersIn(text).filter((n) => !allowed.has(n));
}

export type ExplainInput = {
  /** The proof report, consent diff or any read-only view of them. */
  data: unknown;
  /** The sentence the product shows without AI; also the fallback. */
  template: string;
  packs: readonly Pack[];
  planId?: string | null;
  signal?: AbortSignal;
};

export type Explanation = {
  text: string;
  source: "ai" | "template";
  /** Numbers the model produced that were in neither input. */
  invented: string[];
  call?: RunResult<Summary>["call"];
};

/** The template, used when AI is off, unavailable or caught inventing. */
export function templateExplanation(template: string): Explanation {
  return { text: template, source: "template", invented: [] };
}

export async function explain(
  router: AiRunner,
  input: ExplainInput,
): Promise<Explanation> {
  const json = JSON.stringify(input.data, null, 2);
  const { output, call } = await router.run({
    task: "A5",
    schema: SummarySchema,
    schemaName: "summary",
    system: systemFor("A5", ontologyFor(input.packs)),
    prompt: [
      "Facts (JSON, read-only):",
      json,
      "",
      "The sentence the product would show:",
      input.template,
    ].join("\n"),
    planId: input.planId ?? null,
    ...(input.signal ? { signal: input.signal } : {}),
  });

  const text = output.summary.trim();
  const invented = unsupportedNumbers(text, [json, input.template]);
  if (!text || invented.length > 0) {
    return { ...templateExplanation(input.template), invented, call };
  }
  return { text, source: "ai", invented: [], call };
}
