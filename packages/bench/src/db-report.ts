import { existsSync, readFileSync } from "node:fs";
import type { DbSuites, SuiteOutcome } from "./gates";

type VitestJson = {
  testResults?: {
    name: string;
    assertionResults?: { status: string }[];
  }[];
};

/** Tallies the guard and retry-fuzz files of a Vitest JSON report. */
export function dbSuites(path: string | undefined): DbSuites {
  if (!path) return {};
  if (!existsSync(path)) {
    console.warn(`No DB report at ${path}; the DB gates read "not run".`);
    return {};
  }
  const report = JSON.parse(readFileSync(path, "utf8")) as VitestJson;
  const tally = (match: RegExp): SuiteOutcome | undefined => {
    const files = (report.testResults ?? []).filter((f) => match.test(f.name));
    if (files.length === 0) return undefined;
    const statuses = files.flatMap((f) =>
      (f.assertionResults ?? []).map((a) => a.status),
    );
    return {
      passed: statuses.filter((s) => s === "passed").length,
      failed: statuses.filter((s) => s === "failed").length,
    };
  };
  const guard = tally(/guard(-codes)?\.db\.test\.ts$/);
  const fuzz = tally(/retry-fuzz\.db\.test\.ts$/);
  return { ...(guard ? { guard } : {}), ...(fuzz ? { fuzz } : {}) };
}
