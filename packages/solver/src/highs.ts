import type { Cut, Selection } from "./evaluate";
import { feasible } from "./evaluate";
import { buildModel } from "./model";
import type { Compiled } from "./problem";
import type { BasketLimits } from "./types";

type HighsModule = typeof import("highs");
type Highs = Awaited<ReturnType<HighsModule["default"]>>;

export class SolverEngineError extends Error {
  override name = "SolverEngineError";
}

let loading: Promise<Highs> | null = null;

/**
 * Loads the HiGHS WASM runtime once per process. The module is imported
 * lazily so the exhaustive engine keeps working where the WASM cannot load.
 * A failed load is not cached, so a later call can retry.
 */
export function loadHighs(): Promise<Highs> {
  loading ??= import("highs")
    .then((mod) => mod.default())
    .catch((err: unknown) => {
      loading = null;
      throw new SolverEngineError(`HiGHS failed to load: ${String(err)}`);
    });
  return loading;
}

const OPTIONS = {
  output_flag: false,
  // Exact optimum: the default 0.01% gap could return a different Plan A
  // than the exhaustive engine.
  mip_rel_gap: 0,
  mip_abs_gap: 1e-9,
  random_seed: 0,
  time_limit: 5,
} as const;

/** How many rounding-cent rejections to absorb before giving up. */
const MAX_EXACT_RETRIES = 25;

/**
 * Solves once and returns the best exactly-feasible selection, or null when
 * there is none. A MILP answer is re-checked with integer totals; one that
 * breaks the budget only through half-even rounding is cut and re-solved.
 */
export function solveMilp(
  highs: Highs,
  p: Compiled,
  limits: BasketLimits,
  cuts: readonly Cut[],
): Selection | null {
  const extra: Cut[] = [];
  for (let attempt = 0; attempt <= MAX_EXACT_RETRIES; attempt++) {
    const model = buildModel(p, limits, [...cuts, ...extra]);
    if (!model) return null;
    const result = highs.solve(model.text, OPTIONS);
    if (result.Status === "Infeasible") return null;
    if (result.Status !== "Optimal") {
      throw new SolverEngineError(
        `HiGHS stopped with status "${result.Status}"`,
      );
    }
    const sel = model.columns
      .filter((i) => (result.Columns[`x${i}`]?.Primal ?? 0) > 0.5)
      .sort(
        (a, b) => (p.candidates[a]?.role ?? 0) - (p.candidates[b]?.role ?? 0),
      );
    if (feasible(p, sel, limits)) return sel;
    extra.push({ kind: "exclude", sel });
  }
  throw new SolverEngineError("could not reconcile the MILP with exact totals");
}
