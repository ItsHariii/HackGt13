import { RequirementPatch } from "@cartel/contracts";
import { FLAGSHIP_REQUIREMENTS } from "@cartel/contracts/fixtures";
import { homeOffice } from "@cartel/rule-packs";
import { describe, expect, it } from "vitest";
import { buildPatches, refineRequirements } from "./refine";
import type { PatchProposal } from "./schemas";
import { scriptedModel, testRouter } from "./testing";

const PACKS = [homeOffice];
const OPTIONS = { requirements: FLAGSHIP_REQUIREMENTS, packs: PACKS };

function proposal(
  p: Partial<PatchProposal> & Pick<PatchProposal, "op">,
): PatchProposal {
  return {
    requirementId: null,
    field: null,
    operator: null,
    value: null,
    importance: null,
    weight: null,
    rationale: "asked",
    ...p,
  };
}

describe("A4 buildPatches", () => {
  it('turns "make it $100 cheaper" into a replace on the budget', () => {
    const { patches, rejected } = buildPatches(
      {
        patches: [
          proposal({ op: "replace", requirementId: "r_budget", value: "$900" }),
        ],
        unhandled: [],
      },
      OPTIONS,
    );
    expect(rejected).toEqual([]);
    expect(patches).toEqual([
      {
        op: "replace",
        requirementId: "r_budget",
        set: { target: { amountMinor: 90_000, currency: "USD" } },
      },
    ]);
  });

  it("accepts a target written as the typed JSON value, but only of the field's kind", () => {
    const { patches, rejected } = buildPatches(
      {
        patches: [
          proposal({
            op: "replace",
            requirementId: "r_budget",
            value: '{"amountMinor":90000,"currency":"USD"}',
          }),
          proposal({
            op: "replace",
            requirementId: "r_desk_width",
            value: '{"amountMinor":90000,"currency":"USD"}',
          }),
        ],
        unhandled: [],
      },
      OPTIONS,
    );
    expect(patches).toEqual([
      {
        op: "replace",
        requirementId: "r_budget",
        set: { target: { amountMinor: 90_000, currency: "USD" } },
      },
    ]);
    expect(rejected.map((r) => r.reason)).toEqual(["unparseable"]);
  });

  it("adds through the A1 checks, so an added rule is an unconfirmed assumption", () => {
    const { patches } = buildPatches(
      {
        patches: [
          proposal({
            op: "add",
            field: "webcam.resolution",
            operator: "eq",
            value: "1080p",
            importance: "preference",
            weight: 0.5,
          }),
        ],
        unhandled: [],
      },
      OPTIONS,
    );
    const [patch] = patches;
    expect(patch?.op).toBe("add");
    if (patch?.op !== "add") return;
    expect(patch.requirement).toMatchObject({
      id: "a4_webcam_resolution",
      role: "webcam",
      target: "1080p",
      weight: 0.5,
      provenance: { kind: "ai_inferred", confirmed: false },
    });
  });

  it("rejects edits it cannot apply, and every patch it emits is schema-valid", () => {
    const result = buildPatches(
      {
        patches: [
          proposal({ op: "remove", requirementId: "r_chair_lumbar" }),
          proposal({ op: "remove", requirementId: "r_nope" }),
          proposal({ op: "replace", requirementId: "r_nope", value: "$1" }),
          proposal({ op: "replace", requirementId: "r_budget" }),
          proposal({
            op: "replace",
            requirementId: "r_desk_width",
            value: "roomy",
          }),
          proposal({ op: "add" }),
          proposal({
            op: "add",
            field: "monitor.refresh_rate",
            value: "144 Hz",
          }),
          proposal({ op: "add", field: "desk.width", value: "big" }),
        ],
        unhandled: ["keep the monitor"],
      },
      OPTIONS,
    );
    expect(result.patches).toEqual([
      { op: "remove", requirementId: "r_chair_lumbar" },
    ]);
    expect(result.rejected.map((r) => r.reason)).toEqual([
      "unknown_requirement",
      "unknown_requirement",
      "no_change",
      "unparseable",
      "missing_field",
      "unknown_field",
      "unparseable",
    ]);
    expect(result.unhandled).toEqual(["keep the monitor"]);
    for (const p of result.patches) RequirementPatch.parse(p);
  });
});

describe("A4 refineRequirements", () => {
  it("wraps the command as untrusted input and lists the current ids", async () => {
    const model = scriptedModel([{ patches: [], unhandled: [] }]);
    const { router } = testRouter({ models: { openai: model } });
    const result = await refineRequirements(router, {
      command: "Make it $100 cheaper without changing the monitor",
      ...OPTIONS,
    });
    expect(result.call.task).toBe("A4");
    const sent = JSON.stringify(model.doGenerateCalls[0]?.prompt);
    expect(sent).toContain("r_budget: basket.delivered_total lte");
    expect(sent).toContain('<untrusted source=\\"shopper command\\">');
  });
});
