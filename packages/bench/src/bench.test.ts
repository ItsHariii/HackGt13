import { flagshipStates } from "@cartel/rule-packs/fixtures";
import { describe, expect, it } from "vitest";
import { releaseGates } from "./gates";
import { liveCheckout } from "./mutate";
import { benchReport, junitXml } from "./report";
import { loadScenarios, runScenario, type ScenarioResult } from "./runner";
import { CATEGORIES, CATEGORY_MINIMUMS } from "./scenario";
import { WORLDS } from "./worlds";

const scenarios = loadScenarios();
const results: ScenarioResult[] = [];

describe("ProofBench worlds", () => {
  it("the flagship world is contract v7's checkout exactly", () => {
    expect(liveCheckout(WORLDS.flagship, [], WORLDS.flagship.now)).toEqual(
      flagshipStates.v7(),
    );
  });

  it.each(Object.values(WORLDS))(
    "$id: signs and diffs itself as identical",
    async (world) => {
      const approved = await world.approve("balanced");
      expect(approved.report.summary.hard.fail).toBe(0);
    },
  );
});

describe("ProofBench scenarios (SDD §22.2)", () => {
  it.each(CATEGORIES)("%s has at least its minimum count", (c) => {
    expect(
      scenarios.filter((s) => s.category === c).length,
    ).toBeGreaterThanOrEqual(CATEGORY_MINIMUMS[c]);
  });

  it.each(scenarios.map((s) => [s.id, s] as const))("%s", async (_, s) => {
    const r = await runScenario(s);
    results.push(r);
    expect(r.failures).toEqual([]);
  });

  it("meets the scenario release gates", () => {
    const gates = releaseGates(results);
    expect(gates.filter((g) => g.status === "fail")).toEqual([]);
    expect(
      gates.filter((g) => g.status === "not_run").map((g) => g.id),
    ).toEqual(["no_invalid_executions", "no_duplicate_executions"]);
  });

  it("writes a JUnit report with one case per scenario and gate", () => {
    const report = benchReport(results, releaseGates(results), "abc1234");
    const xml = junitXml(report);
    expect(xml.match(/<testcase /g)).toHaveLength(results.length + 6);
    expect(xml).toContain('<testsuites name="ProofBench"');
  });
});
