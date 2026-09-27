import { Requirement } from "@cartel/contracts";
import { describe, expect, it } from "vitest";
import { adoptLimits } from "./compare-adopt";

const base = {
  scope: "basket",
  importance: "hard",
  evidence: { minStateToPass: "estimated" },
  materiality: "always",
  provenance: { kind: "pack_default", pack: "home_office", ruleId: "x" },
} as const;

const budget = (id: string, amountMinor: number): Requirement => ({
  ...base,
  id,
  field: "basket.delivered_total",
  op: "lte",
  target: { amountMinor, currency: "USD" },
});

const rules: Requirement[] = [
  budget("r_budget", 100_000),
  budget("r_budget_loose", 150_000),
  {
    ...base,
    id: "r_date",
    field: "basket.delivery_latest",
    op: "before",
    target: "2026-09-29",
  },
];

describe("adoptLimits", () => {
  it("rewrites the rule that sets each limit, as the shopper's choice", () => {
    const next = adoptLimits(rules, { budget: 1_200, by: "2026-10-02" });
    expect(next.map((r) => Requirement.safeParse(r).success)).toEqual([
      true,
      true,
      true,
    ]);
    expect(next[0]?.target).toEqual({ amountMinor: 120_000, currency: "USD" });
    expect(next[0]?.provenance).toEqual({
      kind: "user_selected",
      via: "form",
      label: "Budget $1,200, from Compare",
    });
    // Only the tightest budget rule limits the solve; the looser one stays.
    expect(next[1]).toBe(rules[1]);
    expect(next[2]).toMatchObject({ op: "lte", target: "2026-10-02" });
  });

  it("leaves rules alone when nothing was tried", () => {
    expect(adoptLimits(rules, {})).toEqual(rules);
  });
});
