import { homeOffice } from "@proofcart/rule-packs";
import { describe, expect, it } from "vitest";
import { mergeRoles, packRoles, planRoles } from "./roles";
import { scriptedModel, testRouter } from "./testing";

const PACKS = [homeOffice];

describe("A2 roles", () => {
  it("uses the pack template on its own when AI is off", () => {
    expect(packRoles(PACKS).map((r) => [r.role, r.required, r.source])).toEqual(
      [
        ["desk", true, "pack"],
        ["chair", true, "pack"],
        ["monitor", true, "pack"],
        ["dock", false, "pack"],
        ["cable", false, "pack"],
        ["webcam", false, "pack"],
      ],
    );
  });

  it("adds new roles as optional assumptions and drops queries for unknown roles", () => {
    const merged = mergeRoles(
      {
        roles: [
          {
            role: "lamp",
            label: "Desk lamp",
            required: true,
            rationale: "Evening work.",
          },
          {
            role: "desk",
            label: "Another desk",
            required: false,
            rationale: "dup",
          },
          {
            role: "Bad Role",
            label: "x",
            required: true,
            rationale: "invalid id",
          },
        ],
        queries: [
          { role: "lamp", query: "led desk lamp", mustInclude: ["lamp"] },
          {
            role: "monitor",
            query: "27 inch 4k usb-c monitor",
            mustInclude: ["USB-C"],
          },
          { role: "spaceship", query: "rocket", mustInclude: [] },
        ],
      },
      PACKS,
    );
    expect(merged.roles.at(-1)).toEqual({
      role: "lamp",
      label: "Desk lamp",
      required: false,
      source: "ai_inferred",
    });
    expect(merged.roles.filter((r) => r.role === "desk")).toHaveLength(1);
    expect(merged.queries.map((q) => q.role)).toEqual(["lamp", "monitor"]);
    expect(merged.droppedQueries.map((q) => q.role)).toEqual(["spaceship"]);
  });

  it("runs on the primary model and lists the confirmed requirements", async () => {
    const model = scriptedModel([{ roles: [], queries: [] }]);
    const { router } = testRouter({ models: { openai: model } });
    const result = await planRoles(router, {
      packs: PACKS,
      requirements: [
        {
          id: "r_desk",
          scope: "item",
          role: "desk",
          field: "desk.width",
          op: "lte",
          target: { value: 48, unit: "in" },
          importance: "hard",
          evidence: { minStateToPass: "source_stated" },
          materiality: "on_verdict_change",
          provenance: {
            kind: "user_selected",
            via: "form",
            label: "Desk ≤ 48 in",
          },
        },
      ],
    });
    expect(result.call).toMatchObject({ task: "A2", model: "gpt-6-sol" });
    expect(JSON.stringify(model.doGenerateCalls[0]?.prompt)).toContain(
      "r_desk: desk.width lte",
    );
  });
});
