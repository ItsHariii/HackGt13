import { describe, expect, it } from "vitest";
import { loadHighs, solvePlans } from "./index";
import type { SolverCandidate, SolverProblem } from "./types";

/** Deterministic LCG, so the benchmark instance is the same on every run. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1_664_525) + 1_013_904_223) >>> 0;
    return s / 2 ** 32;
  };
}

function pick<T>(items: readonly T[], r: number): T {
  const item = items[Math.floor(r * items.length)];
  if (item === undefined) throw new RangeError("empty list");
  return item;
}

/** SDD §21 target instance: 8 roles × 15 candidates, 3 merchants. */
function benchmark(): SolverProblem {
  const next = rng(20260926);
  const roles = Array.from({ length: 8 }, (_, i) => ({ id: `role${i}` }));
  const merchants = ["demomart", "northwind", "harbor"].map((id, i) => ({
    id,
    shippingMinor: 1500 + i * 600,
  }));
  const dates = ["2026-09-26", "2026-09-27", "2026-09-28", "2026-09-29"];
  const candidates: SolverCandidate[] = roles.flatMap((role, r) =>
    Array.from({ length: 15 }, (_, j) => ({
      id: `o${r}_${j}`,
      role: role.id,
      merchant: pick(merchants, next()).id,
      unitPriceMinor: 2000 + Math.floor(next() * 30_000),
      deliveryBy: pick(dates, next()),
      scores: { comfort: next(), quality: next(), style: next() },
    })),
  );
  return {
    currency: "USD",
    taxRateBps: 700,
    roles,
    merchants,
    candidates,
    incompatible: [
      ["o0_0", "o1_0"],
      ["o2_3", "o3_4"],
    ],
    preferenceWeights: { comfort: 0.6, quality: 0.8, style: 0.3 },
    limits: {
      budget: { requirementId: "r_budget", maxTotalMinor: 110_000 },
      delivery: { requirementId: "r_delivery", by: "2026-09-28" },
      maxMerchants: { requirementId: "r_merchants", max: 2 },
    },
  };
}

describe("solver performance (T5.6)", () => {
  it("returns the top 3 plans for 8 roles × 15 candidates in < 300 ms p50", async () => {
    await loadHighs();
    const problem = benchmark();
    const first = await solvePlans(problem);
    expect(first.status).toBe("optimal");
    expect(first.status === "optimal" && first.plans).toHaveLength(3);

    const times: number[] = [];
    for (let i = 0; i < 9; i++) {
      const start = performance.now();
      await solvePlans(problem);
      times.push(performance.now() - start);
    }
    times.sort((a, b) => a - b);
    const p50 = times[Math.floor(times.length / 2)] ?? Number.POSITIVE_INFINITY;
    expect(p50).toBeLessThan(300);
  });
});
