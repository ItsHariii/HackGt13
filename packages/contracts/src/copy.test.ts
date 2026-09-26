import { describe, expect, it } from "vitest";
import { ChangeClass, DiffClassification } from "./consent";
import {
  changeClassLabel,
  classificationLabel,
  evidenceLabel,
  formatAge,
  provenanceLabel,
  reasonLabel,
  verdictLabel,
} from "./copy";
import { EVIDENCE_STATES, Importance, ReasonCode, Verdict } from "./primitives";

describe("evidenceLabel", () => {
  it("uses Confirmed only for verified, always with source and age", () => {
    expect(evidenceLabel("verified", "GreatHub checkout", 42)).toBe(
      "Confirmed · GreatHub checkout · just now",
    );
    expect(evidenceLabel("verified", "Manufacturer", null)).toBe(
      "Manufacturer says",
    );
    for (const state of EVIDENCE_STATES.filter((s) => s !== "verified")) {
      expect(evidenceLabel(state, "Manufacturer", 10)).not.toMatch(/Confirmed/);
    }
  });

  it("attributes claims and states unknowns plainly", () => {
    expect(evidenceLabel("source_stated", "Manufacturer", 3600)).toBe(
      "Manufacturer says",
    );
    expect(evidenceLabel("supported", "x", 0)).toBe("Evidence suggests");
    expect(evidenceLabel("estimated", "x", 0)).toBe("Estimate");
    expect(evidenceLabel("unknown", "x", 0)).toBe("Can't check");
    expect(evidenceLabel("unknown", "x", 0, "conflict")).toBe(
      "Sources disagree",
    );
  });
});

describe("formatAge", () => {
  it.each([
    [-5, "just now"],
    [59, "just now"],
    [60, "1 min ago"],
    [3599, "59 min ago"],
    [7200, "2 h ago"],
    [86_400 * 3, "3 d ago"],
  ])("%i s → %s", (s, text) => {
    expect(formatAge(s)).toBe(text);
  });
});

describe("verdictLabel", () => {
  it("reads without color", () => {
    expect(verdictLabel("pass", "hard")).toBe("Meets requirement");
    expect(verdictLabel("fail", "hard")).toBe("Doesn't meet requirement");
    expect(verdictLabel("pass", "preference")).toBe("Preference met");
    expect(verdictLabel("fail", "preference")).toBe("Preference not met");
    expect(verdictLabel("unknown", "hard", true)).toBe(
      "Can't check · you accepted this",
    );
  });
});

describe("provenanceLabel", () => {
  it("matches SDD §7.2", () => {
    expect(provenanceLabel("user_stated")).toBe("You said");
    expect(provenanceLabel("user_selected")).toBe("You chose");
    expect(provenanceLabel("ai_inferred")).toBe("I assumed");
    expect(provenanceLabel("pack_default")).toBe("Default");
  });
});

describe("copy rules (SDD §17.3)", () => {
  const all = [
    ...EVIDENCE_STATES.flatMap((s) =>
      ReasonCode.options.map((r) => evidenceLabel(s, "Manufacturer", 100, r)),
    ),
    ...Verdict.options.flatMap((v) =>
      Importance.options.flatMap((i) => [
        verdictLabel(v, i),
        verdictLabel(v, i, true),
      ]),
    ),
    ...ReasonCode.options.map(reasonLabel),
    ...DiffClassification.options.map(classificationLabel),
    ...ChangeClass.options.map(changeClassLabel),
  ];

  it("never promises what evidence can't show", () => {
    for (const text of all) {
      expect(text).not.toMatch(
        /guarantee|\bsafe\b|authentic|will fit|verified comfort/i,
      );
    }
  });

  it("labels every enum value", () => {
    for (const text of all) expect(text.length).toBeGreaterThan(0);
  });
});
