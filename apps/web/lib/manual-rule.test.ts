import { effectiveImportance } from "@cartel/contracts";
import { homeOffice } from "@cartel/rule-packs";
import { describe, expect, it } from "vitest";
import { fieldOptions, manualRule, opsFor } from "./manual-rule";
import { ruleText } from "./workspace";

const packs = [homeOffice];
const opt = (field: string) => {
  const o = fieldOptions(packs).find((f) => f.field === field);
  if (!o) throw new Error(field);
  return o;
};

describe("manual rule builder (AI off)", () => {
  it("offers item fields by role plus basket and order fields", () => {
    const fields = fieldOptions(packs).map((f) => f.field);
    expect(fields).toContain("desk.width");
    expect(fields).toContain("monitor.usb_c_pd_watts");
    expect(fields).toContain("basket.delivered_total");
    expect(fields).toContain("order.substitutions_allowed");
    expect(fields).not.toContain("chair.comfort");
  });

  it("builds the flagship rules from the form alone", () => {
    const rules = [
      { id: "r1", f: "basket.delivered_total", op: "lte", v: "1000" },
      { id: "r2", f: "desk.width", op: "lte", v: "48", unit: "in" },
      { id: "r3", f: "monitor.diagonal", op: "eq", v: "27", unit: "in" },
      { id: "r4", f: "monitor.resolution", op: "eq", v: "4k" },
      { id: "r5", f: "monitor.usb_c_pd_watts", op: "gte", v: "65", unit: "W" },
      { id: "r6", f: "basket.delivery_latest", op: "lte", v: "2026-09-28" },
      { id: "r7", f: "order.substitutions_allowed", op: "eq", v: "no" },
    ] as const;
    const texts = rules.map((r) => {
      const result = manualRule({
        id: r.id,
        field: opt(r.f),
        op: r.op,
        value: r.v,
        unit: "unit" in r ? r.unit : undefined,
        importance: "hard",
      });
      if (!result.ok) throw new Error(result.error);
      expect(result.requirement.provenance.kind).toBe("user_selected");
      expect(effectiveImportance(result.requirement)).toBe("hard");
      return ruleText(result.requirement, packs);
    });
    expect(texts).toEqual([
      "Delivered total ≤ $1,000",
      "Desk width ≤ 48 in",
      "Monitor screen size 27 in",
      "Monitor resolution 4K",
      expect.stringMatching(/≥ 65 W$/),
      "Latest delivery by Mon Sep 28",
      "No substitutions",
    ]);
  });

  it("rejects values that don't fit the field", () => {
    expect(
      manualRule({
        id: "x",
        field: opt("desk.width"),
        op: "lte",
        value: "wide",
        importance: "hard",
      }),
    ).toEqual({ ok: false, error: "Enter a number." });
    expect(
      manualRule({
        id: "x",
        field: opt("monitor.resolution"),
        op: "eq",
        value: "8k",
        importance: "hard",
      }).ok,
    ).toBe(false);
  });

  it("gives preferences a weight and booleans only 'exactly'", () => {
    const r = manualRule({
      id: "p",
      field: opt("chair.adjustable_lumbar"),
      op: "eq",
      value: "yes",
      importance: "preference",
    });
    expect(r.ok && r.requirement.weight).toBe(0.5);
    expect(opsFor("boolean")).toEqual(["eq"]);
  });
});
