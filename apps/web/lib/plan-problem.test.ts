import {
  FLAGSHIP_BRIEF,
  FLAGSHIP_REQUIREMENTS,
} from "@cartel/contracts/fixtures";
import { homeOffice } from "@cartel/rule-packs";
import { greathubOffer, specFact } from "@cartel/rule-packs/fixtures";
import { solvePlans } from "@cartel/solver";
import { describe, expect, it } from "vitest";
import {
  type Screened,
  screenOffer,
  solveRoles,
  toSolverProblem,
} from "./plan-problem";

const PACKS = [homeOffice];
const NOW = "2026-09-26T14:02:05Z";

function desk(id: string, widthIn: number, priceMinor: number) {
  const offer = greathubOffer({
    id: `off_${id}`,
    productId: id,
    sku: id.toUpperCase(),
    title: `Desk ${id}`,
    priceMinor,
    deliveryBy: "2026-09-27",
  });
  const facts = [
    specFact(`f_${id}`, id, "desk.width", { value: widthIn, unit: "in" }),
  ];
  return { offer, facts };
}

describe("solveRoles", () => {
  it("fills the pack's required roles and every role the rules or brief name", () => {
    const roles = solveRoles(FLAGSHIP_REQUIREMENTS, PACKS, FLAGSHIP_BRIEF);
    const ids = roles.map((r) => r.id);
    expect(ids).toEqual(
      expect.arrayContaining(["desk", "chair", "monitor", "cable"]),
    );
    expect(roles.find((r) => r.id === "desk")?.required).toBe(true);
    // The cable is named by a hard rule, so it's required here.
    expect(roles.find((r) => r.id === "cable")?.required).toBe(true);
    // Nothing asks for a webcam.
    expect(ids).not.toContain("webcam");
  });

  it("adds an optional role the brief mentions by name", () => {
    const roles = solveRoles([], PACKS, "I also want a webcam for calls.");
    expect(roles.find((r) => r.id === "webcam")).toMatchObject({
      required: false,
    });
  });
});

describe("screenOffer", () => {
  it("fails a desk that breaks the 48-inch rule and passes one that fits", () => {
    const wide = desk("wide", 55, 20_000);
    const fits = desk("fits", 46.5, 22_900);
    const screen = (d: ReturnType<typeof desk>) =>
      screenOffer({
        role: "desk",
        offer: d.offer,
        facts: d.facts,
        requirements: FLAGSHIP_REQUIREMENTS,
        packs: PACKS,
        now: NOW,
        sources: {},
      });
    expect(screen(wide).fails).toEqual(["r_desk_width"]);
    expect(screen(fits).fails).toEqual([]);
  });
});

describe("toSolverProblem", () => {
  it("keeps only offers that pass the item rules and reads the basket limits", async () => {
    const screened: Screened[] = [
      {
        ...desk("wide", 55, 20_000),
        role: "desk",
        fails: ["r_desk_width"],
        unknown: [],
        scores: {},
      },
      {
        ...desk("fits", 46.5, 22_900),
        role: "desk",
        fails: [],
        unknown: [],
        scores: {},
      },
    ];
    const problem = toSolverProblem({
      roles: [{ id: "desk", label: "Desk", required: true }],
      screened,
      requirements: FLAGSHIP_REQUIREMENTS,
      currency: "USD",
      merchant: { id: "greathub", shippingMinor: 2_400, taxRateBps: 700 },
    });
    expect(problem.candidates.map((c) => c.id)).toEqual(["off_fits"]);
    expect(problem.limits?.budget).toEqual({
      requirementId: "r_budget",
      maxTotalMinor: 100_000,
    });
    expect(problem.limits?.delivery?.by).toBe("2026-09-28");
    const result = await solvePlans(problem, { engine: "exhaustive" });
    expect(result.status).toBe("optimal");
    if (result.status !== "optimal") return;
    expect(result.plans[0]?.lines).toEqual([
      { role: "desk", offerId: "off_fits", qty: 1 },
    ]);
    // 22,900 + 2,400 shipping + 7% tax on merchandise.
    expect(result.plans[0]?.totals.totalMinor).toBe(22_900 + 2_400 + 1_603);
  });

  it("leaves out a product with an unchecked hard rule when a proven one exists", () => {
    const base = { role: "desk", fails: [], scores: {} };
    const problem = toSolverProblem({
      roles: [{ id: "desk", label: "Desk", required: true }],
      screened: [
        { ...base, ...desk("cheap", 44, 15_000), unknown: ["r_desk_width"] },
        { ...base, ...desk("fits", 46.5, 22_900), unknown: [] },
      ],
      requirements: FLAGSHIP_REQUIREMENTS,
      currency: "USD",
      merchant: { id: "greathub", shippingMinor: 2_400, taxRateBps: 700 },
    });
    expect(problem.candidates.map((c) => c.id)).toEqual(["off_fits"]);
  });

  it("reports an empty required role as a conflict, not a plan", async () => {
    const problem = toSolverProblem({
      roles: [{ id: "desk", label: "Desk", required: true }],
      screened: [],
      requirements: FLAGSHIP_REQUIREMENTS,
      currency: "USD",
      merchant: { id: "greathub", shippingMinor: 2_400, taxRateBps: 700 },
    });
    const result = await solvePlans(problem, { engine: "exhaustive" });
    expect(result.status).toBe("infeasible");
    if (result.status === "infeasible")
      expect(result.conflict.emptyRoles).toEqual(["desk"]);
  });
});
