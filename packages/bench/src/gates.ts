import type { ScenarioResult } from "./runner";
import { CATEGORIES, CATEGORY_LABELS, CATEGORY_MINIMUMS } from "./scenario";

/*
 * Release gates (SDD §22.2, TASKS T16.7). The first three come from the
 * scenarios; the last two from the DB integration suites (guard codes and
 * retry fuzz), which only run against a local Supabase. A gate with no
 * evidence reads `not_run`, never `pass`.
 */

export type GateStatus = "pass" | "fail" | "not_run";

export type Gate = {
  id: string;
  label: string;
  status: GateStatus;
  detail: string;
};

/** Outcome of a DB suite, as the CI summarises a Vitest JSON report. */
export type SuiteOutcome = { passed: number; failed: number };

export type DbSuites = {
  /** `guard-codes.db.test.ts` + `guard.db.test.ts`. */
  guard?: SuiteOutcome;
  /** `retry-fuzz.db.test.ts`. */
  fuzz?: SuiteOutcome;
};

function suiteGate(
  id: string,
  label: string,
  outcome: SuiteOutcome | undefined,
  what: string,
): Gate {
  if (!outcome || outcome.passed + outcome.failed === 0)
    return { id, label, status: "not_run", detail: `${what} did not run.` };
  return outcome.failed === 0
    ? {
        id,
        label,
        status: "pass",
        detail: `${outcome.passed} ${what} ${outcome.passed === 1 ? "test" : "tests"} passed.`,
      }
    : {
        id,
        label,
        status: "fail",
        detail: `${outcome.failed} of ${outcome.passed + outcome.failed} ${what} tests failed.`,
      };
}

export function releaseGates(
  results: readonly ScenarioResult[],
  db: DbSuites = {},
): Gate[] {
  const stops = (r: ScenarioResult) =>
    r.actual === "reapprove" ||
    r.actual === "block" ||
    r.actual.startsWith("rejected");
  const material = results.filter((r) => r.material);
  const missed = material.filter((r) => !stops(r));
  const benign = results.filter((r) => !r.material);
  const falseBlocks = benign.filter((r) => stops(r) || r.actual === "error");
  const belowFloor = results.filter((r) => r.hardPassBelowFloor.length > 0);
  const short = CATEGORIES.filter(
    (c) =>
      results.filter((r) => r.category === c).length < CATEGORY_MINIMUMS[c],
  );

  const list = (rs: readonly ScenarioResult[]) =>
    rs
      .slice(0, 5)
      .map((r) => r.id)
      .join(", ") + (rs.length > 5 ? ` and ${rs.length - 5} more` : "");

  return [
    {
      id: "coverage",
      label: "Every SDD §22.2 category has its minimum number of scenarios",
      status: short.length === 0 ? "pass" : "fail",
      detail:
        short.length === 0
          ? `${results.length} scenarios across ${CATEGORIES.length} categories.`
          : `Short: ${short.map((c) => CATEGORY_LABELS[c]).join(", ")}.`,
    },
    {
      id: "material_caught",
      label: "100% of material mutations are re-approved or blocked",
      status: missed.length === 0 ? "pass" : "fail",
      detail:
        missed.length === 0
          ? `${material.length} of ${material.length} stopped.`
          : `Let through: ${list(missed)}.`,
    },
    {
      id: "no_false_blocks",
      label: "0 false blocks on benign scenarios",
      status: falseBlocks.length === 0 ? "pass" : "fail",
      detail:
        falseBlocks.length === 0
          ? `${benign.length} harmless changes allowed.`
          : `Stopped: ${list(falseBlocks)}.`,
    },
    {
      id: "evidence_floor",
      label: "0 hard passes below the required evidence state",
      status: belowFloor.length === 0 ? "pass" : "fail",
      detail:
        belowFloor.length === 0
          ? "Every hard pass met its evidence floor."
          : `Below the floor: ${list(belowFloor)}.`,
    },
    suiteGate(
      "no_invalid_executions",
      "0 executions against an invalid contract",
      db.guard,
      "guard integration",
    ),
    suiteGate(
      "no_duplicate_executions",
      "0 duplicate executions under retry fuzzing",
      db.fuzz,
      "retry fuzz",
    ),
  ];
}
