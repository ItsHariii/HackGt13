import { execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { dbSuites } from "../db-report";
import { releaseGates } from "../gates";
import { benchReport, junitXml, stepSummary } from "../report";
import { loadScenarios, runAll } from "../runner";

/*
 * `pnpm bench [--out dir] [--db-report vitest.json]`: runs every scenario,
 * prints one line each, writes `results.json` (the bench_runs row) and
 * `junit.xml`, and exits non-zero if a scenario or a release gate fails.
 * `--db-report` is the Vitest JSON report of `pnpm db:test:integration`;
 * without it the two DB gates read "not run".
 */

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function gitSha(): string | null {
  const env = process.env.GITHUB_SHA;
  if (env) return env;
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim();
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  // pnpm runs package scripts in the package; resolve paths from where it was invoked.
  const cwd = process.env.INIT_CWD ?? process.cwd();
  const out = resolve(cwd, arg("out") ?? "bench-results");
  const dbReport = arg("db-report");
  const scenarios = loadScenarios();
  const results = await runAll(scenarios);
  for (const r of results) {
    const mark = r.passed ? "✓" : "✗";
    console.log(
      `${mark} ${r.categoryLabel.padEnd(15)} ${r.id.padEnd(44)} ${r.actual}${r.passed ? "" : `  (${r.failures.join("; ")})`}`,
    );
  }
  const gates = releaseGates(
    results,
    dbSuites(dbReport ? resolve(cwd, dbReport) : undefined),
  );
  const report = benchReport(results, gates, gitSha());
  console.log(`\n${report.passed} / ${report.total} scenarios passed`);
  for (const g of gates) {
    const mark = g.status === "pass" ? "✓" : g.status === "fail" ? "✗" : "–";
    console.log(`${mark} ${g.label}: ${g.detail}`);
  }
  mkdirSync(out, { recursive: true });
  writeFileSync(
    resolve(out, "results.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  writeFileSync(resolve(out, "junit.xml"), junitXml(report));
  console.log(`\nWrote ${out}/results.json and junit.xml`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, stepSummary(report));
  }
  if (
    report.passed !== report.total ||
    gates.some((g) => g.status === "fail")
  ) {
    process.exitCode = 1;
  }
}

await main();
