import { effectiveImportance } from "@cartel/contracts";
import { grocery, homeOffice } from "@cartel/rule-packs";
import { describe, expect, it } from "vitest";
import {
  answerRule,
  defaultOp,
  fieldOption,
  fieldOptions,
  manualRule,
  manualRuleId,
  opsFor,
  sameRule,
  targetInput,
} from "./manual-rule";
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

  it("builds list rules like 'no nuts or milk'", () => {
    const allergens = fieldOptions([grocery]).find(
      (o) => o.field === "food.allergens",
    );
    if (!allergens) throw new Error("food.allergens not offered");
    expect(opsFor("list")).toEqual(["excludes", "contains"]);
    const r = manualRule({
      id: "u_food_allergens",
      field: allergens,
      op: "excludes",
      value: "Nuts, milk, nuts",
      importance: "hard",
    });
    if (!r.ok) throw new Error(r.error);
    expect(r.requirement.target).toEqual(["nuts", "milk"]);
    expect(r.requirement.role).toBe("food");
    expect(targetInput(r.requirement)).toEqual({ value: "nuts, milk" });
    expect(
      manualRule({
        id: "x",
        field: allergens,
        op: "excludes",
        value: " , ",
        importance: "hard",
      }),
    ).toEqual({ ok: false, error: "List at least one item." });
  });

  it("resolves fields the form doesn't list, so every known rule is editable", () => {
    expect(fieldOption("offer.returnable", packs, "desk")).toMatchObject({
      scope: "item",
      role: "desk",
      kind: "boolean",
    });
    // An item field with no item to attach it to can't become a rule.
    expect(fieldOption("offer.returnable", packs)).toBeUndefined();
    expect(fieldOption("basket.delivery_latest", [])).toMatchObject({
      scope: "basket",
      kind: "date",
    });
    expect(fieldOption("basket.missing_roles", packs)).toBeUndefined();
    expect(fieldOption("party.vibe", packs)).toBeUndefined();
  });

  it("reads a one-value answer the way people mean it", () => {
    expect(defaultOp("date")).toBe("lte");
    expect(defaultOp("money")).toBe("lte");
    expect(defaultOp("boolean")).toBe("eq");
    expect(defaultOp("enum")).toBe("eq");
    expect(defaultOp("list")).toBe("excludes");

    const date = opt("basket.delivery_latest");
    const first = answerRule({ field: date, value: "2026-10-10", rules: [] });
    if (!first.ok) throw new Error(first.error);
    expect(first.requirement).toMatchObject({
      id: "u_basket_delivery_latest",
      op: "lte",
      target: "2026-10-10",
      importance: "hard",
      provenance: { kind: "user_selected" },
    });
    expect(ruleText(first.requirement, packs)).toBe(
      "Latest delivery by Sat Oct 10",
    );
    expect(sameRule([first.requirement], first.requirement)).toBe(
      first.requirement,
    );
    expect(
      sameRule([first.requirement], { ...first.requirement, op: "gte" }),
    ).toBeUndefined();
    expect(manualRuleId(date.field, [first.requirement.id])).toBe(
      "u_basket_delivery_latest_2",
    );
    expect(answerRule({ field: date, value: "", rules: [] })).toEqual({
      ok: false,
      error: "Enter a date.",
    });
  });
});
