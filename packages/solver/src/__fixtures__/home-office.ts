import type { SolverCandidate, SolverProblem } from "../types";

/*
 * Solver fixtures built on the flagship home-office catalog (SDD §16.1).
 * DemoMart ships flat $24.00 and tax is 7% of merchandise, as in the seed.
 */

const MON = "2026-09-28";

const base = {
  currency: "USD",
  taxRateBps: 700,
  roles: [
    { id: "desk" },
    { id: "chair" },
    { id: "monitor" },
    { id: "cable" },
    { id: "webcam" },
  ],
  merchants: [{ id: "demomart", shippingMinor: 2400 }],
} satisfies Partial<SolverProblem>;

function dm(
  id: string,
  role: string,
  unitPriceMinor: number,
  deliveryBy: string,
  scores?: Record<string, number>,
): SolverCandidate {
  return {
    id,
    role,
    merchant: "demomart",
    unitPriceMinor,
    deliveryBy,
    ...(scores ? { scores } : {}),
  };
}

/**
 * Contract v7's world: Plan A must be the canonical basket, $815.00 +
 * $24.00 + $57.05 = $896.05. The Halden arrives Tuesday, so it is out.
 */
export const FLAGSHIP_PROBLEM: SolverProblem = {
  ...base,
  candidates: [
    dm("dm_birchline_465", "desk", 22_900, "2026-09-27"),
    dm("dm_atlas_standing_48", "desk", 34_900, "2026-09-27", {
      p_standing_desk: 1,
    }),
    dm("dm_kestrel_mesh", "chair", 18_900, "2026-09-27", { r_chair_lumbar: 1 }),
    dm("dm_marlow_task", "chair", 13_900, "2026-09-26"),
    dm("dm_vireo_u2727", "monitor", 32_900, MON),
    dm("dm_halden_m27q", "monitor", 30_900, "2026-09-29"),
    dm("dm_loop_100w_2m", "cable", 1_900, "2026-09-26"),
    dm("dm_volt_240w_2m", "cable", 2_900, "2026-09-26"),
    dm("dm_pica_1080", "webcam", 4_900, "2026-09-27"),
  ],
  preferenceWeights: { r_chair_lumbar: 0.5, p_standing_desk: 0.2 },
  limits: {
    budget: { requirementId: "r_budget", maxTotalMinor: 100_000 },
    delivery: { requirementId: "r_delivery", by: MON },
  },
};

export const FLAGSHIP_PLAN_A = [
  "dm_birchline_465",
  "dm_kestrel_mesh",
  "dm_vireo_u2727",
  "dm_loop_100w_2m",
  "dm_pica_1080",
];

/**
 * TASKS T5.5: "budget $900 + Monday". The only monitor that arrives by
 * Monday is the Aster, which puts the basket at $984.00; the Vireo fits
 * $900 but arrives Wednesday. Expected conflict: {budget, delivery}, relax
 * by +$84.00 or to Wednesday 2026-09-30.
 */
export const BUDGET_MONDAY_PROBLEM: SolverProblem = {
  ...base,
  candidates: [
    dm("dm_birchline_465", "desk", 22_900, "2026-09-27"),
    dm("dm_kestrel_mesh", "chair", 18_900, "2026-09-27"),
    dm("dm_aster_a27u", "monitor", 41_120, MON),
    dm("dm_vireo_u2727", "monitor", 32_900, "2026-09-30"),
    dm("dm_halden_m27q", "monitor", 30_900, "2026-10-01"),
    dm("dm_loop_100w_2m", "cable", 1_900, "2026-09-26"),
    dm("dm_pica_1080", "webcam", 4_900, "2026-09-27"),
  ],
  limits: {
    budget: { requirementId: "r_budget", maxTotalMinor: 90_000 },
    delivery: { requirementId: "r_delivery", by: MON },
  },
};
