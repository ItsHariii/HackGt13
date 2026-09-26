import { homeOffice } from "@proofcart/rule-packs";
import { describe, expect, it } from "vitest";
import { explain, numbersIn, unsupportedNumbers } from "./explain";
import { httpError, scriptedModel, testRouter } from "./testing";

const PACKS = [homeOffice];
const DIFF = {
  classification: "block",
  item: "Vireo U2727",
  field: "USB-C power",
  before: "90 W",
  after: "15 W",
  required: "65 W",
  wouldHaveTotal: "$881.07",
};
const TEMPLATE =
  "USB-C power on Vireo U2727 dropped from 90 W to 15 W; your plan needs at least 65 W.";

describe("A5 number guard", () => {
  it("reads prices, dates and plain numbers", () => {
    expect(numbersIn("$1,234.50 on 2026-09-28, 90 W.")).toEqual([
      "1234.50",
      "2026-09-28",
      "90",
    ]);
  });

  it("lists numbers in neither the data nor the template", () => {
    expect(
      unsupportedNumbers("Fell to 15 W, not 60 W.", [
        JSON.stringify(DIFF),
        TEMPLATE,
      ]),
    ).toEqual(["60"]);
  });
});

describe("A5 explain", () => {
  const input = { data: DIFF, template: TEMPLATE, packs: PACKS };

  it("returns the AI wording when every number comes from the input", async () => {
    const { router } = testRouter({
      models: {
        openai: scriptedModel([
          {
            summary:
              "The Vireo U2727 now states 15 W of USB-C power instead of 90 W, below the 65 W your plan needs. The $881.07 purchase was blocked.",
          },
        ]),
      },
    });
    const result = await explain(router, input);
    expect(result.source).toBe("ai");
    expect(result.call?.model).toBe("gpt-6-luna");
  });

  it("falls back to the template when the model invents a number", async () => {
    const { router } = testRouter({
      models: {
        openai: scriptedModel([
          { summary: "Power fell to 15 W; you would have saved $10." },
        ]),
      },
    });
    const result = await explain(router, input);
    expect(result).toMatchObject({
      source: "template",
      text: TEMPLATE,
      invented: ["10"],
    });
  });

  it("surfaces an outage so the caller can show the template", async () => {
    const { router } = testRouter({
      models: {
        openai: scriptedModel([httpError(503)]),
        meta: scriptedModel([httpError(503)]),
      },
    });
    await expect(explain(router, input)).rejects.toMatchObject({
      name: "AiUnavailableError",
    });
  });
});
