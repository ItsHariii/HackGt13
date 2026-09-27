import { describe, expect, it } from "vitest";
import {
  allRevealed,
  applySolveLine,
  IDLE_SOLVE,
  revealAll,
  revealNext,
  type SolveLine,
  type SolveRun,
  solveHeadline,
} from "./solve-progress";
import type { ProofRowView, ProofView } from "./workspace";

const row = (id: string, kind: ProofRowView["kind"]): ProofRowView => ({
  id,
  requirementId: id,
  rule: `Rule ${id}`,
  kind,
  status: kind === "fail" ? "Fail" : "Pass",
  value: "1",
  evidence: "GreatHub says",
  evidenceTone: "ink",
  hard: true,
});

const proof = (rows: ProofRowView[]): ProofView => ({
  headline: "3 of 3 hard rules pass",
  sub: "",
  ticks: rows.map((r) => (r.kind === "fail" ? "fail" : "pass")),
  rows,
});

const apply = (lines: SolveLine[], from: SolveRun = IDLE_SOLVE) =>
  lines.reduce(applySolveLine, from);

describe("solve progress", () => {
  it("names the step the server is on", () => {
    expect(apply([{ phase: "reading", done: 0, total: 14 }]).step).toBe(
      "Reading 14 GreatHub product pages",
    );
    expect(apply([{ phase: "reading", done: 9, total: 14 }]).step).toBe(
      "Reading GreatHub product pages · 9 of 14",
    );
    expect(apply([{ phase: "quoting", labels: ["A", "B"] }]).step).toBe(
      "Pricing Plan A, Plan B through GreatHub's checkout",
    );
    expect(solveHeadline(IDLE_SOLVE)).toBe("Finding plans…");
  });

  it("keeps the first proved plan and reveals its rows one at a time", () => {
    const rows = [row("a", "pass"), row("b", "pass"), row("c", "pass")];
    let s = apply([
      { phase: "proof", label: "A", proof: proof(rows) },
      { phase: "proof", label: "B", proof: proof([row("z", "fail")]) },
    ]);
    expect(s.label).toBe("A");
    expect(s.proof?.rows).toHaveLength(3);
    expect(solveHeadline(s)).toBe("0 of 3 checked…");
    s = revealNext(s);
    expect(s.revealed).toBe(1);
    expect(solveHeadline(s)).toBe("1 of 3 checked…");
    s = revealNext(revealNext(s));
    expect(allRevealed(s)).toBe(true);
    expect(revealNext(s)).toBe(s);
    expect(solveHeadline(s)).toBe("3 of 3 hard rules pass.");
  });

  it("shows every row at once for reduced motion", () => {
    const s = apply([
      { phase: "proof", label: "A", proof: proof([row("a", "pass")]) },
    ]);
    expect(allRevealed(revealAll(s))).toBe(true);
    expect(revealAll(IDLE_SOLVE)).toBe(IDLE_SOLVE);
  });

  it("ends with the outcome or a message to act on", () => {
    expect(apply([{ phase: "done", outcome: "infeasible" }]).outcome).toBe(
      "infeasible",
    );
    expect(
      apply([{ phase: "error", code: "merchant_unavailable" }]).error,
    ).toMatch(/GreatHub didn't answer/);
    expect(
      apply([{ phase: "error", code: "rate_limited", retryAfterMs: 4_200 }])
        .error,
    ).toBe("Too many searches in a row. Try again in 5 seconds.");
  });
});
