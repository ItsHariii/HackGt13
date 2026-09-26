import { describe, expect, it } from "vitest";
import {
  BUDGET_MONDAY_PROBLEM,
  FLAGSHIP_PLAN_A,
  FLAGSHIP_PROBLEM,
} from "./__fixtures__/home-office";
import { satisfiesCut, taxMinor } from "./evaluate";
import { loadHighs, SolverInputError, solvePlans } from "./index";
import { buildModel } from "./model";
import { compile } from "./problem";
import type { Plan, SolveResult } from "./types";

function optimal(result: SolveResult): Plan[] {
  if (result.status !== "optimal")
    throw new Error(`expected plans, got ${result.status}`);
  return result.plans;
}

const offers = (plan: Plan | undefined) =>
  plan?.lines.map((l) => l.offerId) ?? [];

describe("taxMinor", () => {
  it("rounds half to even", () => {
    expect(taxMinor(81_500, 700)).toBe(5705);
    expect(taxMinor(79_100, 700)).toBe(5537);
    expect(taxMinor(150, 700)).toBe(10); // 10.5 → 10
    expect(taxMinor(50, 700)).toBe(4); // 3.5 → 4
    expect(taxMinor(0, 700)).toBe(0);
  });
});

describe("HiGHS (T5.1)", () => {
  it("solves a toy MILP in Node", async () => {
    const highs = await loadHighs();
    const r = highs.solve(
      [
        "Maximize",
        " obj: 3 x + 2 y",
        "Subject To",
        " c1: x + y <= 1.5",
        "Binary",
        " x y",
        "End",
      ].join("\n"),
      { output_flag: false },
    );
    expect(r.Status).toBe("Optimal");
    expect(r.ObjectiveValue).toBe(3);
    expect(r.Columns.x).toMatchObject({ Primal: 1 });
  });
});

describe("model builder (T5.2)", () => {
  it("writes every SDD §9.1 constraint family", () => {
    const text =
      buildModel(compile(FLAGSHIP_PROBLEM), FLAGSHIP_PROBLEM.limits ?? {})
        ?.text ?? "";
    for (const row of ["role0:", "link0:", "tax:", "budget:"])
      expect(text).toContain(row);
    expect(text).toMatch(/General\n t/);
    // The Tuesday Halden never enters the model under a Monday deadline.
    expect(text).not.toMatch(/\bx5\b/);
  });

  it("reports a required role with nothing deliverable as trivially infeasible", () => {
    const p = compile(FLAGSHIP_PROBLEM);
    expect(
      buildModel(p, { delivery: { requirementId: "r", by: "2026-01-01" } }),
    ).toBeNull();
  });

  it("rejects malformed input", () => {
    expect(() =>
      compile({
        ...FLAGSHIP_PROBLEM,
        candidates: FLAGSHIP_PROBLEM.candidates.map((c) => ({
          ...c,
          role: "sofa",
        })),
      }),
    ).toThrow(SolverInputError);
    expect(() => compile({ ...FLAGSHIP_PROBLEM, taxRateBps: 7.5 })).toThrow(
      SolverInputError,
    );
  });
});

describe.each(["highs", "exhaustive"] as const)("%s engine", (engine) => {
  it("picks the canonical flagship basket as Plan A", async () => {
    const [a] = optimal(await solvePlans(FLAGSHIP_PROBLEM, { engine }));
    expect(offers(a)).toEqual(FLAGSHIP_PLAN_A);
    expect(a?.totals).toEqual({
      currency: "USD",
      merchandiseMinor: 81_500,
      shippingMinor: 2400,
      taxMinor: 5705,
      totalMinor: 89_605,
    });
    expect(a?.deliveryLatest).toBe("2026-09-28");
    expect(a?.tradeoff).toBeNull();
  });

  it("returns three diverse plans with labelled tradeoffs (T5.3)", async () => {
    const plans = optimal(await solvePlans(FLAGSHIP_PROBLEM, { engine }));
    expect(plans.map((p) => p.label)).toEqual(["A", "B", "C"]);
    for (const [i, plan] of plans.entries()) {
      const earlier = plans.slice(0, i);
      for (const prev of earlier) {
        expect(plan.objective).toBeLessThanOrEqual(prev.objective);
        const kept = offers(plan).filter((id) => offers(prev).includes(id));
        expect(kept.length).toBeLessThanOrEqual(plan.lines.length - 2);
      }
    }
    // B saves money by giving up lumbar; C buys the standing desk, also without lumbar.
    expect(plans[1]?.tradeoff).toEqual({
      gain: { kind: "cost", savesMinor: 4280 },
      loss: { kind: "preference", preferenceId: "r_chair_lumbar", delta: -1 },
    });
    expect(plans[2]?.tradeoff).toEqual({
      gain: { kind: "preference", preferenceId: "p_standing_desk", delta: 1 },
      loss: { kind: "preference", preferenceId: "r_chair_lumbar", delta: -1 },
    });
  });

  it("finds the budget + Monday conflict with +$84.00 or Wednesday (T5.5)", async () => {
    const result = await solvePlans(BUDGET_MONDAY_PROBLEM, { engine });
    expect(result.status).toBe("infeasible");
    if (result.status !== "infeasible") return;
    expect(result.conflict).toEqual({
      emptyRoles: [],
      members: [
        {
          limit: "budget",
          requirementId: "r_budget",
          relaxation: { kind: "budget", toMinor: 98_400, deltaMinor: 8400 },
        },
        {
          limit: "delivery",
          requirementId: "r_delivery",
          relaxation: { kind: "delivery", to: "2026-09-30" },
        },
      ],
    });
  });
});

describe("conflict edge cases", () => {
  it("names required roles with no candidates", async () => {
    const result = await solvePlans({
      ...FLAGSHIP_PROBLEM,
      roles: [...FLAGSHIP_PROBLEM.roles, { id: "lamp" }],
    });
    expect(result.status === "infeasible" && result.conflict).toEqual({
      members: [],
      emptyRoles: ["lamp"],
    });
  });

  it("keeps only the limits that conflict", async () => {
    const result = await solvePlans({
      ...BUDGET_MONDAY_PROBLEM,
      limits: {
        ...BUDGET_MONDAY_PROBLEM.limits,
        maxMerchants: { requirementId: "r_one_store", max: 1 },
      },
    });
    expect(
      result.status === "infeasible" &&
        result.conflict.members.map((m) => m.limit),
    ).toEqual(["budget", "delivery"]);
  });
});

describe("cuts", () => {
  it("exclude removes exactly one basket; diverse needs two changes", () => {
    expect(satisfiesCut([1, 2, 3], { kind: "exclude", sel: [1, 2, 3] })).toBe(
      false,
    );
    expect(
      satisfiesCut([1, 2, 3, 4], { kind: "exclude", sel: [1, 2, 3] }),
    ).toBe(true);
    expect(satisfiesCut([1, 2, 9], { kind: "diverse", sel: [1, 2, 3] })).toBe(
      false,
    );
    expect(satisfiesCut([1, 8, 9], { kind: "diverse", sel: [1, 2, 3] })).toBe(
      true,
    );
    expect(satisfiesCut([7], { kind: "diverse", sel: [3] })).toBe(true);
    expect(satisfiesCut([], { kind: "diverse", sel: [] })).toBe(false);
  });
});
