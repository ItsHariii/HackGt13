import type { Requirement } from "@cartel/contracts";
import { describe, expect, it } from "vitest";
import { briefWithAnswer, rulesFromAnswer } from "./question-answer";

const brief = "Birthday party for 12 kids, one is gluten-free.";

const rule = (
  id: string,
  field: string,
  provenance: Requirement["provenance"],
  op: Requirement["op"] = "lte",
): Requirement => ({
  id,
  scope: "basket",
  field,
  op,
  target: "2026-10-10",
  importance: "hard",
  evidence: { minStateToPass: "estimated" },
  materiality: "always",
  provenance,
});

describe("answering a question in your own words", () => {
  it("appends the question and answer to the brief", () => {
    expect(briefWithAnswer(`${brief}\n`, " When is it? ", "Oct 10 ")).toBe(
      `${brief}\n\nQ: When is it?\nA: Oct 10`,
    );
  });

  it("keeps only new rules and marks answer quotes as the shopper's choice", () => {
    const full = briefWithAnswer(brief, "When is it?", "by Oct 10");
    const at = full.indexOf("by Oct 10");
    const existing = rule("a1_food_gluten_free", "food.gluten_free", {
      kind: "user_stated",
      quote: "gluten-free",
      span: [35, 46],
    });
    const drafted = [
      // A restatement of a brief rule: dropped.
      rule("a1_food_gluten_free", "food.gluten_free", existing.provenance),
      rule("a1_basket_delivery_latest", "basket.delivery_latest", {
        kind: "user_stated",
        quote: "by Oct 10",
        span: [at, at + 9],
      }),
      // Same field and operator as the one above: dropped.
      rule("a1_basket_delivery_latest_2", "basket.delivery_latest", {
        kind: "ai_inferred",
        rationale: "party date",
        confirmed: false,
      }),
    ];
    const added = rulesFromAnswer(drafted, [existing], brief.length);
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({
      id: "u_basket_delivery_latest",
      provenance: { kind: "user_selected", via: "form", label: "“by Oct 10”" },
    });
  });

  it("keeps assumptions as assumptions", () => {
    const assumed = rule(
      "a1_basket_delivered_total",
      "basket.delivered_total",
      {
        kind: "ai_inferred",
        rationale: "a typical kids' party budget",
        confirmed: false,
      },
    );
    const [added] = rulesFromAnswer([assumed], [], brief.length);
    expect(added?.provenance).toEqual(assumed.provenance);
    expect(added?.id).toBe("u_basket_delivered_total");
  });
});
