import type { ProofResult } from "@cartel/contracts";
import { evaluateResults, explain, fieldDef } from "@cartel/proof-engine";
import { describe, expect, it } from "vitest";
import {
  CARRY_ON_NOW,
  CARRY_ON_PACKS,
  CARRY_ON_REQUIREMENTS,
  carryOnItems,
  greathubCheckout,
} from "./fixtures";

type Key = keyof typeof carryOnItems;

/** Evaluates one item against the carry-on defaults; returns the result for its role's rule. */
function check(key: Key, requirementId: string): ProofResult {
  const item = carryOnItems[key];
  const checkout = greathubCheckout([item], { now: CARRY_ON_NOW });
  const results = evaluateResults({
    ...checkout,
    requirements: CARRY_ON_REQUIREMENTS,
    packs: CARRY_ON_PACKS,
    now: CARRY_ON_NOW,
  }).filter((r) => r.requirementId === requirementId);
  expect(results).toHaveLength(1);
  return results[0] as ProofResult;
}

describe("travel: carry-on (SDD §16.1)", () => {
  it("bags: orientation-aware against 22 × 14 × 9 in", () => {
    expect(check("fieldnote", "d_travel_carry_on_size")).toMatchObject({
      verdict: "pass",
      observed: { dims: [21.5, 14, 9], unit: "in" },
      evidenceState: "source_stated",
    });
    expect(check("atlas", "d_travel_carry_on_size")).toMatchObject({
      verdict: "fail",
      observed: { dims: [21.7, 13.8, 10.8], unit: "in" },
    });
  });

  it("power banks: 20K ≈ 74 Wh (estimate) passes; 30K ≈ 111 Wh fails", () => {
    expect(check("volt20k", "d_travel_power_bank_wh")).toMatchObject({
      verdict: "pass",
      observed: { value: 74, unit: "Wh" },
      evidenceState: "estimated",
      factIds: ["f_volt_20k_0"],
    });
    expect(check("volt30k", "d_travel_power_bank_wh")).toMatchObject({
      verdict: "fail",
      observed: { value: 111, unit: "Wh" },
      evidenceState: "estimated",
    });
  });

  it("uses a stated Wh or a stated cell voltage instead of the 3.7 V assumption", () => {
    expect(check("volt26k", "d_travel_power_bank_wh")).toMatchObject({
      verdict: "pass",
      observed: { value: 99.16, unit: "Wh" },
      evidenceState: "source_stated",
    });
    expect(check("volt10k", "d_travel_power_bank_wh")).toMatchObject({
      verdict: "pass",
      observed: { value: 38.5, unit: "Wh" },
      evidenceState: "source_stated",
    });
  });

  it("plug type and input voltage for the destination (UK: type G, 230 V)", () => {
    expect(check("ukAdapter", "d_travel_plug_type").verdict).toBe("pass");
    expect(check("euAdapter", "d_travel_plug_type")).toMatchObject({
      verdict: "fail",
      observed: ["C", "F"],
    });
    expect(check("laptopCharger", "d_travel_input_voltage").verdict).toBe(
      "pass",
    );
    expect(check("usHairDryer", "d_travel_input_voltage").verdict).toBe("fail");
  });

  it("liquids ≤ 100 ml: 3.4 fl oz passes, 150 ml fails", () => {
    expect(check("bottle34", "d_travel_liquids")).toMatchObject({
      verdict: "pass",
      observed: { value: 3.4, unit: "fl_oz" },
    });
    expect(check("bottle150", "d_travel_liquids").verdict).toBe("fail");
  });

  it("explains the derived estimate", () => {
    const r = check("volt30k", "d_travel_power_bank_wh");
    expect(
      explain(r, { def: fieldDef("power_bank.energy_wh", CARRY_ON_PACKS) }),
    ).toBe(
      "Battery energy: 111 Wh (estimate), which doesn't meet at most 100 Wh.",
    );
  });
});
