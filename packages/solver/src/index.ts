import { findConflict } from "./conflict";
import { exhaustiveEligible, solveExhaustive } from "./exhaustive";
import { loadHighs, SolverEngineError, solveMilp } from "./highs";
import { buildPlans, type SolveOnce, topSelections } from "./plans";
import { type Compiled, compile, SolverInputError } from "./problem";
import type { Engine, SolveResult, SolverProblem } from "./types";

export { taxMinor } from "./evaluate";
export {
  EXHAUSTIVE_MAX_CANDIDATES_PER_ROLE,
  EXHAUSTIVE_MAX_ROLES,
} from "./exhaustive";
export { loadHighs, SolverEngineError } from "./highs";
export {
  DEFAULT_COST_PER_DOLLAR,
  DEFAULT_PER_MERCHANT,
  SolverInputError,
} from "./problem";
export {
  type LimitsFromRequirements,
  limitsFromRequirements,
} from "./requirements";
export type * from "./types";

export interface SolveOptions {
  /** How many diverse plans to return. Default 3 (Plans A–C). */
  k?: number;
  /**
   * `auto` (default) uses HiGHS and falls back to the exhaustive engine
   * when the WASM cannot load and the instance is small enough.
   */
  engine?: "auto" | Engine;
}

async function pickEngine(
  p: Compiled,
  choice: SolveOptions["engine"],
): Promise<[Engine, SolveOnce]> {
  const exhaustive: SolveOnce = (l, cuts) => solveExhaustive(p, l, cuts);
  if (choice === "exhaustive") {
    if (!exhaustiveEligible(p)) {
      throw new SolverInputError(
        "instance too large for the exhaustive engine",
      );
    }
    return ["exhaustive", exhaustive];
  }
  try {
    const highs = await loadHighs();
    return ["highs", (l, cuts) => solveMilp(highs, p, l, cuts)];
  } catch (err) {
    if (
      choice === "auto" &&
      err instanceof SolverEngineError &&
      exhaustiveEligible(p)
    ) {
      return ["exhaustive", exhaustive];
    }
    throw err;
  }
}

/**
 * Solves the basket problem (SDD §9): up to `k` diverse plans ranked by the
 * objective, or, when nothing satisfies every hard limit, the minimal
 * conflict set with the smallest relaxation per member.
 */
export async function solvePlans(
  problem: SolverProblem,
  options: SolveOptions = {},
): Promise<SolveResult> {
  const k = options.k ?? 3;
  if (!Number.isInteger(k) || k < 1)
    throw new SolverInputError("k must be a positive integer");
  const p = compile(problem);
  const [engine, solve] = await pickEngine(p, options.engine ?? "auto");
  const limits = problem.limits ?? {};
  const selections = topSelections(solve, limits, k);
  if (selections.length === 0) {
    return {
      status: "infeasible",
      engine,
      conflict: findConflict(p, solve, limits),
    };
  }
  return { status: "optimal", engine, plans: buildPlans(p, selections) };
}
