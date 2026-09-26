import type { Pack } from "@cartel/proof-engine";
import { ontologyFor } from "./ontology";
import { systemFor, untrustedBlock } from "./prompts";
import type { AiRunner, RunResult } from "./router";
import { type Extraction, ExtractionSchema } from "./schemas";

/*
 * A3: fact candidates from unstructured text (SDD §10.1, §10.2). This is the
 * only role that ever sees merchant text, it has no tools, and its output is
 * a proposal: `@cartel/evidence` verifies every quote against the source
 * and parses every value before a fact exists.
 */

/** The shape `@cartel/evidence` asks for, kept structural on purpose. */
export type ExtractionFieldInput = {
  field: string;
  label: string;
  kind: string;
};

export type FactCandidate = {
  field: string;
  rawValue: string;
  quote: string;
};

/** Long pages cost tokens and bury the specs; the evidence layer chunks. */
export const MAX_SOURCE_CHARS = 12_000;

export type ExtractInput = {
  text: string;
  fields: readonly ExtractionFieldInput[];
  packs: readonly Pack[];
  planId?: string | null;
  signal?: AbortSignal;
};

function promptFor(input: ExtractInput): string {
  const text =
    input.text.length > MAX_SOURCE_CHARS
      ? input.text.slice(0, MAX_SOURCE_CHARS)
      : input.text;
  return [
    "Fields to look for:",
    ...input.fields.map((f) => `  ${f.field} — ${f.label} (${f.kind})`),
    "",
    untrustedBlock("listing text", text),
  ].join("\n");
}

export async function extractFacts(
  router: AiRunner,
  input: ExtractInput,
): Promise<{
  candidates: FactCandidate[];
  /** Candidates for fields nobody asked for, dropped before the caller sees them. */
  dropped: FactCandidate[];
  call: RunResult<Extraction>["call"];
}> {
  const { output, call } = await router.run({
    task: "A3",
    schema: ExtractionSchema,
    schemaName: "fact_candidates",
    system: systemFor("A3", ontologyFor(input.packs)),
    prompt: promptFor(input),
    planId: input.planId ?? null,
    ...(input.signal ? { signal: input.signal } : {}),
  });

  const requested = new Set(input.fields.map((f) => f.field));
  const candidates: FactCandidate[] = [];
  const dropped: FactCandidate[] = [];
  for (const c of output.candidates) {
    const candidate = {
      field: c.field.trim(),
      rawValue: c.rawValue.trim(),
      quote: c.quote,
    };
    (requested.has(candidate.field) ? candidates : dropped).push(candidate);
  }
  return { candidates, dropped, call };
}

/**
 * An extractor for `extractQuotedFacts` in `@cartel/evidence`. A failure
 * returns nothing rather than throwing: with no candidates the fields simply
 * stay unknown, which is the documented "no AI" behaviour.
 */
export function createFactExtractor(
  router: AiRunner,
  options: { packs: readonly Pack[]; planId?: string | null },
): (input: {
  text: string;
  fields: readonly ExtractionFieldInput[];
  signal?: AbortSignal;
}) => Promise<readonly FactCandidate[]> {
  return async ({ text, fields, signal }) => {
    try {
      const { candidates } = await extractFacts(router, {
        text,
        fields,
        packs: options.packs,
        planId: options.planId ?? null,
        ...(signal ? { signal } : {}),
      });
      return candidates;
    } catch {
      return [];
    }
  };
}
