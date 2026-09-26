import type { Requirement } from "@cartel/contracts";
import type { Pack } from "@cartel/proof-engine";
import { ontologyFor } from "./ontology";
import { systemFor } from "./prompts";
import type { AiRunner, RunResult } from "./router";
import { type CandidateQuery, type RolePlan, RolePlanSchema } from "./schemas";

/*
 * A2: roles and candidate queries (SDD §10.1). The pack's role template is
 * the source of truth; the model may add a role, and an added role is marked
 * so the UI can show it as an assumption. With AI off the pack template is
 * used on its own.
 */

export type PlannedRole = {
  role: string;
  label: string;
  required: boolean;
  source: "pack" | "ai_inferred";
};

export type RolePlanResult = {
  roles: PlannedRole[];
  queries: CandidateQuery[];
  /** Queries whose role is not in the plan, dropped. */
  droppedQueries: CandidateQuery[];
};

const ROLE_ID = /^[a-z][a-z0-9_]*$/;

/** The pack template alone: the "AI off" path and the base for a merge. */
export function packRoles(packs: readonly Pack[]): PlannedRole[] {
  return packs.flatMap((pack) =>
    pack.roles.map((r) => ({
      role: r.role,
      label: r.label,
      // A predicate role is required only for some baskets; treat it as
      // optional until the engine evaluates it.
      required: r.required === true,
      source: "pack" as const,
    })),
  );
}

/** Merges the model's proposals into the pack template. */
export function mergeRoles(
  plan: RolePlan,
  packs: readonly Pack[],
): RolePlanResult {
  const roles = packRoles(packs);
  const known = new Set(roles.map((r) => r.role));
  for (const proposal of plan.roles) {
    const role = proposal.role.trim();
    if (!ROLE_ID.test(role) || known.has(role)) continue;
    known.add(role);
    roles.push({
      role,
      label: proposal.label.trim() || role,
      // An AI-added role never becomes a required one on its own.
      required: false,
      source: "ai_inferred",
    });
  }
  const queries: CandidateQuery[] = [];
  const droppedQueries: CandidateQuery[] = [];
  for (const q of plan.queries) {
    (known.has(q.role.trim()) ? queries : droppedQueries).push(q);
  }
  return { roles, queries, droppedQueries };
}

export type RolePlanInput = {
  requirements: readonly Requirement[];
  packs: readonly Pack[];
  planId?: string | null;
  signal?: AbortSignal;
};

function promptFor(input: RolePlanInput): string {
  const lines = input.requirements.map(
    (r) =>
      `- ${r.id}: ${r.field} ${r.op} ${JSON.stringify(r.target)} (${r.importance})`,
  );
  return [
    "Confirmed requirements:",
    ...(lines.length > 0 ? lines : ["  (none yet)"]),
  ].join("\n");
}

export async function planRoles(
  router: AiRunner,
  input: RolePlanInput,
): Promise<RolePlanResult & { call: RunResult<RolePlan>["call"] }> {
  const { output, call } = await router.run({
    task: "A2",
    schema: RolePlanSchema,
    schemaName: "role_plan",
    system: systemFor("A2", ontologyFor(input.packs)),
    prompt: promptFor(input),
    planId: input.planId ?? null,
    ...(input.signal ? { signal: input.signal } : {}),
  });
  return { ...mergeRoles(output, input.packs), call };
}
