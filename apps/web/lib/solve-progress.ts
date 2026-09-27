import type { ProofView } from "./workspace";

/*
 * Live "Find plans" (TASKS T11.3; DESIGN.md Motion board 03). The solve
 * streams what it is doing as NDJSON lines from POST /api/plans/[id]/solve,
 * each one sent at the real point in lib/plan-solve.ts. Plan A's proof rows
 * arrive together (the engine checks every rule at once) and are revealed
 * one row at a time, ≈150 ms apart, while the Inspector stamps them.
 */

export type SolveErrorCode =
  | "not_found"
  | "no_rules"
  | "merchant_unavailable"
  | "no_candidates"
  | "storage"
  | "rate_limited";

export type SolveProgress =
  | { phase: "reading"; done: number; total: number }
  | { phase: "solving" }
  | { phase: "quoting"; labels: string[] }
  | { phase: "proof"; label: string; proof: ProofView }
  | { phase: "saving" };

export type SolveLine =
  | SolveProgress
  | { phase: "done"; outcome: "solved" | "infeasible" }
  | { phase: "error"; code: SolveErrorCode; retryAfterMs?: number };

export const SOLVE_MESSAGE: Record<SolveErrorCode, string> = {
  not_found: "This plan isn't yours or no longer exists.",
  no_rules: "Add at least one rule first.",
  merchant_unavailable:
    "GreatHub didn't answer, so no plan was priced. Nothing was bought. Try again in a moment.",
  no_candidates:
    "GreatHub doesn't sell anything for these rules yet. Edit the rules or search products.",
  storage: "The plans couldn't be saved. Nothing was bought. Try again.",
  rate_limited: "Too many searches in a row. Try again in a moment.",
};

export type SolveRun = {
  /** What the server is doing now, in words; null before the first line. */
  step: string | null;
  /** Plan A's proof, once it is proved. */
  proof: ProofView | null;
  label: string | null;
  /** How many of `proof.rows` are shown as checked. */
  revealed: number;
  outcome: "solved" | "infeasible" | null;
  error: string | null;
};

export const IDLE_SOLVE: SolveRun = {
  step: null,
  proof: null,
  label: null,
  revealed: 0,
  outcome: null,
  error: null,
};

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

function stepText(p: SolveProgress): string {
  switch (p.phase) {
    case "reading":
      return p.done === 0
        ? `Reading ${plural(p.total, "GreatHub product page", "GreatHub product pages")}`
        : `Reading GreatHub product pages · ${p.done} of ${p.total}`;
    case "solving":
      return "Picking up to three plans that meet every hard rule";
    case "quoting":
      return `Pricing ${p.labels.map((l) => `Plan ${l}`).join(", ")} through GreatHub's checkout`;
    case "proof":
      return `Checking Plan ${p.label} against your rules`;
    case "saving":
      return "Saving the plans and their proof";
  }
}

/** Applies one NDJSON line from the solve stream. */
export function applySolveLine(s: SolveRun, line: SolveLine): SolveRun {
  switch (line.phase) {
    case "done":
      return { ...s, outcome: line.outcome };
    case "error":
      return {
        ...s,
        error:
          line.code === "rate_limited" && line.retryAfterMs
            ? `Too many searches in a row. Try again in ${Math.ceil(line.retryAfterMs / 1000)} seconds.`
            : SOLVE_MESSAGE[line.code],
      };
    case "proof":
      // Only the first proved plan streams into the list (Plan A).
      if (s.proof) return { ...s, step: stepText(line) };
      return {
        ...s,
        step: stepText(line),
        proof: line.proof,
        label: line.label,
      };
    default:
      return { ...s, step: stepText(line) };
  }
}

/** Shows the next proof row as checked; a no-op once every row is shown. */
export function revealNext(s: SolveRun): SolveRun {
  if (!s.proof || s.revealed >= s.proof.rows.length) return s;
  return { ...s, revealed: s.revealed + 1 };
}

/** Every row shown (reduced motion, or the list has caught up). */
export const revealAll = (s: SolveRun): SolveRun =>
  s.proof ? { ...s, revealed: s.proof.rows.length } : s;

export const allRevealed = (s: SolveRun) =>
  s.proof !== null && s.revealed >= s.proof.rows.length;

/** The headline: "4 of 12 checked…" while rows land, then the proof's own summary. */
export function solveHeadline(s: SolveRun): string {
  if (!s.proof) return s.error ? "No plan was priced." : "Finding plans…";
  if (!allRevealed(s))
    return `${s.revealed} of ${s.proof.rows.length} checked…`;
  return `${s.proof.headline}.`;
}
