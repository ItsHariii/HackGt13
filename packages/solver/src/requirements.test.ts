import type { Requirement } from "@cartel/contracts";
import { FLAGSHIP_REQUIREMENTS } from "@cartel/contracts/fixtures";
import { describe, expect, it } from "vitest";
import { limitsFromRequirements } from "./requirements";

const budget = FLAGSHIP_REQUIREMENTS.find(
  (r) => r.id === "r_budget",
) as Requirement;
const delivery = FLAGSHIP_REQUIREMENTS.find(
  (r) => r.id === "r_delivery",
) as Requirement;

describe("limitsFromRequirements", () => {
  it("maps the flagship basket rules onto solver limits", () => {
    const { limits, unmodeled } = limitsFromRequirements(
      FLAGSHIP_REQUIREMENTS,
      "USD",
    );
    expect(limits).toEqual({
      budget: { requirementId: "r_budget", maxTotalMinor: 100_000 },
      delivery: { requirementId: "r_delivery", by: "2026-09-28" },
    });
    expect(unmodeled).toEqual([]);
  });

  it("keeps the tightest of several bounds and reads `before` as strict", () => {
    const { limits } = limitsFromRequirements(
      [
        budget,
        {
          ...budget,
          id: "r_budget_tight",
          target: { amountMinor: 90_000, currency: "USD" },
        },
        { ...delivery, id: "r_before", op: "before", target: "2026-09-28" },
      ],
      "USD",
    );
    expect(limits.budget).toEqual({
      requirementId: "r_budget_tight",
      maxTotalMinor: 90_000,
    });
    expect(limits.delivery).toEqual({
      requirementId: "r_before",
      by: "2026-09-27",
    });
  });

  it("never turns an unconfirmed assumption into a limit", () => {
    const assumed: Requirement = {
      ...budget,
      provenance: {
        kind: "ai_inferred",
        rationale: "Typical home-office spend.",
        confirmed: false,
      },
    };
    expect(limitsFromRequirements([assumed], "USD").limits).toEqual({});
  });

  it("reports hard basket rules it cannot model", () => {
    const other: Requirement = {
      ...budget,
      id: "r_eur",
      target: { amountMinor: 1, currency: "EUR" },
    };
    expect(limitsFromRequirements([other], "USD").unmodeled).toEqual([other]);
  });
});
