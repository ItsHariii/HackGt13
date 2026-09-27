import { FLAGSHIP_REQUIREMENTS } from "@cartel/contracts/fixtures";
import { homeOffice } from "@cartel/rule-packs";
import { describe, expect, it } from "vitest";
import { applyPatches, diffLines } from "./refine";

const PACKS = [homeOffice];
const budget = FLAGSHIP_REQUIREMENTS.find((r) => r.id === "r_budget");

describe("applyPatches", () => {
  it("lowers the budget, drops a rule and adds one", () => {
    const desk = FLAGSHIP_REQUIREMENTS.find((r) => r.id === "r_desk_width");
    if (!budget || !desk) throw new Error("fixture changed");
    const next = applyPatches(FLAGSHIP_REQUIREMENTS, [
      {
        op: "replace",
        requirementId: "r_budget",
        set: { target: { amountMinor: 90_000, currency: "USD" } },
      },
      { op: "remove", requirementId: "r_monitor_4k" },
      { op: "add", requirement: { ...desk, id: "r_desk_width" } },
    ]);
    expect(next.find((r) => r.id === "r_budget")?.target).toEqual({
      amountMinor: 90_000,
      currency: "USD",
    });
    expect(next.some((r) => r.id === "r_monitor_4k")).toBe(false);
    // An added rule never overwrites an existing ID.
    expect(
      next.filter((r) => r.field === "desk.width").map((r) => r.id),
    ).toEqual(["r_desk_width", "r_desk_width_2"]);
  });

  it("gives a rule turned into a preference a weight, and drops it when made hard", () => {
    const soft = applyPatches(FLAGSHIP_REQUIREMENTS, [
      {
        op: "replace",
        requirementId: "r_monitor_4k",
        set: { importance: "preference" },
      },
    ]).find((r) => r.id === "r_monitor_4k");
    expect(soft).toMatchObject({ importance: "preference", weight: 0.5 });
    const hard = applyPatches(soft ? [soft] : [], [
      {
        op: "replace",
        requirementId: "r_monitor_4k",
        set: { importance: "hard" },
      },
    ])[0];
    expect(hard?.importance).toBe("hard");
    expect(hard && "weight" in hard).toBe(false);
  });
});

describe("diffLines", () => {
  it("describes each patch in rule words", () => {
    const lines = diffLines(
      FLAGSHIP_REQUIREMENTS,
      [
        {
          op: "replace",
          requirementId: "r_budget",
          set: { target: { amountMinor: 90_000, currency: "USD" } },
        },
        { op: "remove", requirementId: "r_monitor_4k" },
      ],
      PACKS,
    );
    expect(lines[0]?.kind).toBe("change");
    if (lines[0]?.kind === "change") {
      expect(lines[0].before).toMatch(/1,000/);
      expect(lines[0].after).toMatch(/900/);
    }
    expect(lines[1]).toMatchObject({ kind: "remove" });
  });
});
