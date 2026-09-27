import {
  type Requirement,
  type RequirementPatch,
  Requirement as RequirementSchema,
} from "@cartel/contracts";
import type { Pack } from "@cartel/proof-engine";
import { ruleText } from "./workspace";

/*
 * Applying A4 patches (TASKS T11.3): the shopper sees a diff, confirms, and
 * only then do the rules change. Pure, so the preview and the apply agree.
 */

export type DiffLine =
  | { kind: "add"; after: string }
  | { kind: "remove"; before: string }
  | { kind: "change"; before: string; after: string };

function uniqueId(id: string, taken: ReadonlySet<string>): string {
  if (!taken.has(id)) return id;
  let n = 2;
  while (taken.has(`${id}_${n}`)) n++;
  return `${id}_${n}`;
}

/** The rules after the patches; a patch that would leave an invalid rule is skipped. */
export function applyPatches(
  requirements: readonly Requirement[],
  patches: readonly RequirementPatch[],
): Requirement[] {
  let out = [...requirements];
  for (const p of patches) {
    if (p.op === "remove") {
      out = out.filter((r) => r.id !== p.requirementId);
      continue;
    }
    if (p.op === "add") {
      const id = uniqueId(p.requirement.id, new Set(out.map((r) => r.id)));
      out.push({ ...p.requirement, id });
      continue;
    }
    out = out.map((r) => {
      if (r.id !== p.requirementId) return r;
      const importance = p.set.importance ?? r.importance;
      const { weight: _old, ...rest } = r;
      const weight =
        importance === "preference" ? (p.set.weight ?? r.weight ?? 0.5) : null;
      const next = {
        ...rest,
        ...(p.set.op ? { op: p.set.op } : {}),
        ...(p.set.target !== undefined ? { target: p.set.target } : {}),
        importance,
        ...(weight === null ? {} : { weight }),
        // The shopper confirmed this change, so it's theirs now.
        ...(r.provenance.kind === "ai_inferred"
          ? { provenance: { ...r.provenance, confirmed: true } }
          : {}),
      };
      const parsed = RequirementSchema.safeParse(next);
      return parsed.success ? parsed.data : r;
    });
  }
  return out;
}

/** The patches as a rule diff, in the words the requirements list uses. */
export function diffLines(
  requirements: readonly Requirement[],
  patches: readonly RequirementPatch[],
  packs: readonly Pack[],
): DiffLine[] {
  const after = applyPatches(requirements, patches);
  const lines: DiffLine[] = [];
  for (const p of patches) {
    if (p.op === "add") {
      const added = after.find(
        (r) =>
          r.field === p.requirement.field &&
          !requirements.some((x) => x.id === r.id),
      );
      lines.push({
        kind: "add",
        after: ruleText(added ?? p.requirement, packs),
      });
      continue;
    }
    const before = requirements.find((r) => r.id === p.requirementId);
    if (!before) continue;
    if (p.op === "remove") {
      lines.push({ kind: "remove", before: ruleText(before, packs) });
      continue;
    }
    const next = after.find((r) => r.id === p.requirementId);
    const was = ruleText(before, packs);
    const now = next ? ruleText(next, packs) : was;
    const strength = (r: Requirement) =>
      r.importance === "hard" ? " (hard)" : " (preference)";
    lines.push({
      kind: "change",
      before:
        was +
        (next && next.importance !== before.importance ? strength(before) : ""),
      after:
        now +
        (next && next.importance !== before.importance ? strength(next) : ""),
    });
  }
  return lines;
}
