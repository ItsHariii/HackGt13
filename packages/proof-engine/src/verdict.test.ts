import type { Box, EvidenceState, Operator, Value } from "@cartel/contracts";
import { describe, expect, it } from "vitest";
import type { Resolved } from "./evidence";
import type { FieldDef } from "./fields";
import { judge, satisfies } from "./verdict";

const W = (value: number) => ({ value, unit: "W" as const });
const usd = (amountMinor: number) => ({ amountMinor, currency: "USD" });
const LEN: FieldDef = {
  kind: "length",
  label: "Width",
  tolerance: { value: 0.5, unit: "mm" },
};
const RES: FieldDef = {
  kind: "enum",
  label: "Resolution",
  values: ["1080p", "1440p", "4k"],
  aliases: { uhd: "4k", "2160p": "4k" },
};

/** [op, target, a satisfying value, a violating value (null if none), def?] */
const OPERATORS: [Operator, Value, Value, Value | null, FieldDef?][] = [
  ["eq", "4k", "UHD", "1440p", RES],
  ["neq", "1080p", "4k", "1080p", RES],
  ["gte", W(65), W(90), W(15)],
  [
    "lte",
    { value: 48, unit: "in" },
    { value: 118, unit: "cm" },
    { value: 52, unit: "in" },
    LEN,
  ],
  [
    "between",
    { min: { value: 35.5, unit: "in" }, max: { value: 36.5, unit: "in" } },
    { value: 36.5, unit: "in" },
    { value: 37, unit: "in" },
    LEN,
  ],
  ["in", ["navy", "black"], "Navy", "red"],
  ["not_in", ["wool"], ["cotton", "linen"], ["cotton", "wool"]],
  ["contains", "g", ["A", "G"], ["A", "C"]],
  ["excludes", "wool", ["cotton", "polyester"], ["cotton", "wool"]],
  ["before", "2026-10-09", "2026-10-07", "2026-10-09"],
  ["compatible_with", true, true, false],
  ["exists", true, true, null],
];

const at = (
  value: Value | null,
  state: EvidenceState,
  reason: Resolved["reason"] = null,
): Resolved => ({
  value,
  state,
  reason: state === "unknown" ? (reason ?? "no_fact") : null,
  conflict: false,
  factIds: value === null ? [] : ["f1"],
});

describe.each(OPERATORS)("%s", (op, target, good, bad, def) => {
  const req = {
    op,
    target,
    evidence: { minStateToPass: "source_stated" as const },
  };

  it("pass: satisfies with state ≥ minStateToPass", () => {
    expect(judge(req, at(good, "source_stated"), def)).toEqual({
      verdict: "pass",
      reason: null,
      evidenceState: "source_stated",
    });
    expect(judge(req, at(good, "verified"), def).verdict).toBe("pass");
  });

  it("unknown (insufficient_evidence): satisfies on weak evidence", () => {
    expect(judge(req, at(good, "estimated"), def)).toEqual({
      verdict: "unknown",
      reason: "insufficient_evidence",
      evidenceState: "estimated",
    });
  });

  it.runIf(bad !== null)("fail: violates on strong evidence", () => {
    expect(judge(req, at(bad, "verified"), def)).toEqual({
      verdict: "fail",
      reason: "not_satisfied",
      evidenceState: "verified",
    });
  });

  it.runIf(bad !== null)("fail: weak evidence can still fail", () => {
    expect(judge(req, at(bad, "estimated"), def).verdict).toBe("fail");
    expect(judge(req, at(bad, "supported"), def).verdict).toBe("fail");
  });

  it("unknown: no fact, stale, conflict or subjective never pass or fail", () => {
    for (const reason of [
      "no_fact",
      "stale",
      "conflict",
      "subjective",
    ] as const) {
      const r = judge(req, at(null, "unknown", reason), def);
      expect(r).toEqual({
        verdict: "unknown",
        reason,
        evidenceState: "unknown",
      });
    }
    // a stale fact keeps its old value for display but is still unknown
    expect(judge(req, at(good, "unknown", "stale"), def).verdict).toBe(
      "unknown",
    );
  });
});

describe("satisfies edge cases", () => {
  it("returns null (incomparable) across dimensions, currencies and shapes", () => {
    expect(satisfies("gte", W(65), { value: 65, unit: "Wh" })).toBeNull();
    expect(
      satisfies("lte", usd(100), { amountMinor: 100, currency: "EUR" }),
    ).toBeNull();
    expect(satisfies("gte", "65 W", W(65))).toBeNull();
    expect(satisfies("eq", usd(1), W(1))).toBeNull();
    expect(satisfies("in", "navy", "navy")).toBeNull();
    expect(satisfies("before", "soon", "2026-10-09")).toBeNull();
    expect(
      judge(
        { op: "gte", target: W(65), evidence: { minStateToPass: "estimated" } },
        at({ value: 65, unit: "Wh" }, "verified"),
      ),
    ).toEqual({
      verdict: "unknown",
      reason: "incomparable",
      evidenceState: "verified",
    });
  });

  it("compares money and dates", () => {
    expect(satisfies("lte", usd(89_605), usd(100_000))).toBe(true);
    expect(satisfies("lte", "2026-09-28", "2026-09-28")).toBe(true);
    expect(satisfies("lte", "2026-09-28T18:00:00Z", "2026-09-28")).toBe(true);
    expect(satisfies("lte", "2026-09-29", "2026-09-28")).toBe(false);
    expect(satisfies("before", "2026-09-28", "2026-09-28")).toBe(false);
  });

  it("checks boxes orientation-aware and ranges by containment", () => {
    const limit: Box = { dims: [22, 14, 9], unit: "in" };
    expect(satisfies("lte", { dims: [14, 9, 21.5], unit: "in" }, limit)).toBe(
      true,
    );
    expect(
      satisfies("lte", { dims: [21.7, 13.8, 10.8], unit: "in" }, limit),
    ).toBe(false);
    const input = {
      min: { value: 100, unit: "V" },
      max: { value: 240, unit: "V" },
    } as const;
    expect(satisfies("contains", input, { value: 230, unit: "V" })).toBe(true);
    expect(
      satisfies(
        "contains",
        { min: { value: 100, unit: "V" }, max: { value: 127, unit: "V" } },
        { value: 230, unit: "V" },
      ),
    ).toBe(false);
  });

  it("exists with target false fails when a value is stated", () => {
    const req = {
      op: "exists" as const,
      target: false,
      evidence: { minStateToPass: "source_stated" as const },
    };
    expect(judge(req, at("text", "source_stated")).verdict).toBe("fail");
    expect(judge(req, at(null, "unknown")).verdict).toBe("unknown");
  });

  it("a hard requirement never passes below minStateToPass (invariant 4)", () => {
    const states: EvidenceState[] = [
      "verified",
      "source_stated",
      "supported",
      "estimated",
      "unknown",
    ];
    for (const min of states) {
      for (const s of states) {
        const r = judge(
          { op: "gte", target: W(65), evidence: { minStateToPass: min } },
          at(s === "unknown" ? null : W(90), s),
        );
        if (r.verdict === "pass")
          expect(states.indexOf(s)).toBeLessThanOrEqual(states.indexOf(min));
      }
    }
  });
});
