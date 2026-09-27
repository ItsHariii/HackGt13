import { FLAGSHIP_REQUIREMENTS } from "@cartel/contracts/fixtures";
import { evaluateResults } from "@cartel/proof-engine";
import { describe, expect, it } from "vitest";
import { FLAGSHIP_PACKS, FLAGSHIP_T7, flagshipStates } from "./fixtures";

/** SDD §23: one basket, ≤ 50 requirements, < 20 ms (TASKS T17.6). */
describe("proof engine performance", () => {
  it("evaluates the flagship basket against 50 requirements in < 20 ms p50", () => {
    const requirements = Array.from({ length: 50 }, (_, i) => {
      const r = FLAGSHIP_REQUIREMENTS[i % FLAGSHIP_REQUIREMENTS.length];
      if (!r) throw new RangeError("no requirements");
      return { ...r, id: `${r.id}_${i}` };
    });
    const input = {
      ...flagshipStates.v7(),
      requirements,
      packs: FLAGSHIP_PACKS,
      now: FLAGSHIP_T7,
    };
    expect(evaluateResults(input).length).toBeGreaterThanOrEqual(50);

    const times: number[] = [];
    for (let i = 0; i < 21; i++) {
      const start = performance.now();
      evaluateResults(input);
      times.push(performance.now() - start);
    }
    times.sort((a, b) => a - b);
    const p50 = times[Math.floor(times.length / 2)] ?? Number.POSITIVE_INFINITY;
    expect(p50).toBeLessThan(20);
  });
});
