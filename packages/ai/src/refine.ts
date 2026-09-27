import {
  type Requirement,
  type RequirementPatch,
  RequirementPatch as RequirementPatchSchema,
  UNIT_DIMENSION,
  type Value,
  Value as ValueSchema,
} from "@cartel/contracts";
import type { FieldDef, Pack } from "@cartel/proof-engine";
import { ontologyFor, targetText } from "./ontology";
import { systemFor, untrustedBlock } from "./prompts";
import { buildRequirements, targetFor } from "./requirements";
import type { AiRunner, RunResult } from "./router";
import {
  type PatchProposal,
  type Refinement,
  RefinementSchema,
} from "./schemas";

/*
 * A4: refinement commands (SDD §10.1). "Make it $100 cheaper without changing
 * the monitor" becomes `RequirementPatch[]`, which the workspace shows as a
 * requirement diff. Nothing is applied until the shopper confirms, and a
 * patch that names a requirement or a field we don't have is dropped here.
 */

export type RejectedPatch = {
  proposal: PatchProposal;
  reason:
    | "unknown_requirement"
    | "unknown_field"
    | "missing_field"
    | "unparseable"
    | "no_change"
    | "invalid";
};

export type RefinementResult = {
  patches: RequirementPatch[];
  /** What the model could not express as an edit; shown to the shopper. */
  unhandled: string[];
  rejected: RejectedPatch[];
};

export type PatchOptions = {
  requirements: readonly Requirement[];
  packs: readonly Pack[];
  currency?: string;
};

/**
 * A target the model wrote as the typed JSON value instead of text
 * (`{"amountMinor":90000,"currency":"USD"}`). Accepted only when it is a
 * valid value of the field's own kind.
 */
function jsonTarget(raw: string, def: FieldDef): Value | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const v = ValueSchema.safeParse(parsed);
  if (!v.success || typeof v.data !== "object" || v.data === null) return null;
  if (Array.isArray(v.data)) return def.kind === "list" ? v.data : null;
  if ("amountMinor" in v.data) return def.kind === "money" ? v.data : null;
  if ("unit" in v.data)
    return UNIT_DIMENSION[v.data.unit] === def.kind ? v.data : null;
  return null;
}

/** Reads a replacement target with the same parser A1 uses. */
function replacementTarget(
  proposal: PatchProposal,
  field: string,
  def: FieldDef,
  currency: string | undefined,
) {
  const json = jsonTarget(proposal.value ?? "", def);
  if (json) return json;
  return targetFor(
    {
      field,
      role: null,
      op: proposal.operator ?? "eq",
      value: proposal.value ?? "",
      importance: proposal.importance ?? "preference",
      weight: proposal.weight,
      quote: null,
      rationale: proposal.rationale,
    },
    def,
    currency,
  );
}

/** Turns proposals into patches against the current requirement list. */
export function buildPatches(
  refinement: Refinement,
  options: PatchOptions,
): RefinementResult {
  const byId = new Map(options.requirements.map((r) => [r.id, r]));
  const patches: RequirementPatch[] = [];
  const rejected: RejectedPatch[] = [];

  for (const proposal of refinement.patches) {
    const id = proposal.requirementId?.trim();
    if (proposal.op === "remove") {
      if (!id || !byId.has(id)) {
        rejected.push({ proposal, reason: "unknown_requirement" });
        continue;
      }
      patches.push({ op: "remove", requirementId: id });
      continue;
    }

    if (proposal.op === "add") {
      const field = proposal.field?.trim();
      if (!field) {
        rejected.push({ proposal, reason: "missing_field" });
        continue;
      }
      // An added requirement goes through exactly the A1 path, so it gets the
      // same ontology check, the same parsing and `ai_inferred` provenance.
      const built = buildRequirements(
        {
          pack: null,
          questions: [],
          requirements: [
            {
              field,
              role: null,
              op: proposal.operator ?? "eq",
              value: proposal.value ?? "",
              importance: proposal.importance ?? "preference",
              weight: proposal.weight,
              quote: null,
              rationale: proposal.rationale,
            },
          ],
        },
        {
          brief: "",
          packs: options.packs,
          idPrefix: "a4",
          ...(options.currency ? { currency: options.currency } : {}),
        },
      );
      const requirement = built.requirements[0];
      if (!requirement) {
        const reason = built.dropped[0]?.reason;
        rejected.push({
          proposal,
          reason: reason === "unparseable" ? "unparseable" : "unknown_field",
        });
        continue;
      }
      patches.push({ op: "add", requirement });
      continue;
    }

    const current = id ? byId.get(id) : undefined;
    if (!current) {
      rejected.push({ proposal, reason: "unknown_requirement" });
      continue;
    }
    const set: {
      op?: Requirement["op"];
      target?: Requirement["target"];
      importance?: Requirement["importance"];
      weight?: number;
    } = {};
    if (proposal.operator) set.op = proposal.operator;
    if (proposal.importance) set.importance = proposal.importance;
    if (proposal.weight !== null) set.weight = proposal.weight;
    if (proposal.value !== null && proposal.value.trim() !== "") {
      const def = ontologyFor(options.packs).get(current.field);
      const target = def
        ? replacementTarget(proposal, current.field, def, options.currency)
        : null;
      if (target === null) {
        rejected.push({ proposal, reason: "unparseable" });
        continue;
      }
      set.target = target;
    }
    if (Object.keys(set).length === 0) {
      rejected.push({ proposal, reason: "no_change" });
      continue;
    }
    const parsed = RequirementPatchSchema.safeParse({
      op: "replace",
      requirementId: current.id,
      set,
    });
    if (!parsed.success) {
      rejected.push({ proposal, reason: "invalid" });
      continue;
    }
    patches.push(parsed.data);
  }

  return { patches, unhandled: [...refinement.unhandled], rejected };
}

export type RefineInput = {
  command: string;
  requirements: readonly Requirement[];
  packs: readonly Pack[];
  planId?: string | null;
  currency?: string;
  signal?: AbortSignal;
};

function promptFor(input: RefineInput): string {
  const lines = input.requirements.map(
    (r) =>
      `- ${r.id}: ${r.field} ${r.op} ${targetText(r, input.packs)} (${r.importance})`,
  );
  return [
    "Current requirements:",
    ...(lines.length > 0 ? lines : ["  (none)"]),
    "",
    untrustedBlock("shopper command", input.command),
  ].join("\n");
}

export async function refineRequirements(
  router: AiRunner,
  input: RefineInput,
): Promise<RefinementResult & { call: RunResult<Refinement>["call"] }> {
  const { output, call } = await router.run({
    task: "A4",
    schema: RefinementSchema,
    schemaName: "refinement",
    system: systemFor("A4", ontologyFor(input.packs)),
    prompt: promptFor(input),
    planId: input.planId ?? null,
    ...(input.signal ? { signal: input.signal } : {}),
  });
  return {
    ...buildPatches(output, {
      requirements: input.requirements,
      packs: input.packs,
      ...(input.currency ? { currency: input.currency } : {}),
    }),
    call,
  };
}
