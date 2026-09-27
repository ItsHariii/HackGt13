import type { Gate } from "./gates";
import type { ScenarioResult } from "./runner";

/*
 * Bench output: a JSON report (what `bench_runs` stores and /bench reads)
 * and JUnit XML for CI annotations.
 */

export const REPORT_SCHEMA = "cartel.bench/1";

export type BenchReport = {
  schema: typeof REPORT_SCHEMA;
  gitSha: string | null;
  createdAt: string;
  passed: number;
  total: number;
  gates: Gate[];
  results: ScenarioResult[];
};

export function benchReport(
  results: ScenarioResult[],
  gates: Gate[],
  gitSha: string | null,
  createdAt = new Date().toISOString(),
): BenchReport {
  return {
    schema: REPORT_SCHEMA,
    gitSha,
    createdAt,
    passed: results.filter((r) => r.passed).length,
    total: results.length,
    gates,
    results,
  };
}

const XML: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
};
function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => XML[c] as string);
}

export function junitXml(report: BenchReport): string {
  const byCategory = new Map<string, ScenarioResult[]>();
  for (const r of report.results) {
    const list = byCategory.get(r.categoryLabel) ?? [];
    list.push(r);
    byCategory.set(r.categoryLabel, list);
  }
  const gateFailures = report.gates.filter((g) => g.status === "fail");
  const suites = [...byCategory].map(([label, rs]) => {
    const failed = rs.filter((r) => !r.passed).length;
    const time = rs.reduce((t, r) => t + r.ms, 0) / 1000;
    const cases = rs.map((r) => {
      const open = `    <testcase classname="proofbench.${esc(r.category)}" name="${esc(`${r.id}: ${r.name}`)}" time="${(r.ms / 1000).toFixed(3)}"`;
      return r.passed
        ? `${open}/>`
        : `${open}>\n      <failure message="${esc(r.failures[0] ?? "failed")}">${esc(r.failures.join("\n"))}</failure>\n    </testcase>`;
    });
    return `  <testsuite name="ProofBench: ${esc(label)}" tests="${rs.length}" failures="${failed}" time="${time.toFixed(3)}">\n${cases.join("\n")}\n  </testsuite>`;
  });
  const gates = report.gates.map((g) => {
    const open = `    <testcase classname="proofbench.gates" name="${esc(g.label)}"`;
    if (g.status === "pass") return `${open}/>`;
    if (g.status === "not_run")
      return `${open}>\n      <skipped message="${esc(g.detail)}"/>\n    </testcase>`;
    return `${open}>\n      <failure message="${esc(g.detail)}"/>\n    </testcase>`;
  });
  suites.push(
    `  <testsuite name="ProofBench: release gates" tests="${report.gates.length}" failures="${gateFailures.length}" skipped="${report.gates.filter((g) => g.status === "not_run").length}">\n${gates.join("\n")}\n  </testsuite>`,
  );
  const failures =
    report.results.filter((r) => !r.passed).length + gateFailures.length;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<testsuites name="ProofBench" tests="${report.total + report.gates.length}" failures="${failures}">\n${suites.join("\n")}\n</testsuites>\n`;
}

/** Markdown for the GitHub Actions job summary. */
export function stepSummary(report: BenchReport): string {
  const mark = { pass: "✅", fail: "❌", not_run: "➖" } as const;
  const byCategory = new Map<string, { passed: number; total: number }>();
  for (const r of report.results) {
    const c = byCategory.get(r.categoryLabel) ?? { passed: 0, total: 0 };
    byCategory.set(r.categoryLabel, {
      passed: c.passed + (r.passed ? 1 : 0),
      total: c.total + 1,
    });
  }
  const failed = report.results.filter((r) => !r.passed);
  return [
    `## ProofBench: ${report.passed} / ${report.total}`,
    "",
    "| Release gate | | |",
    "|---|---|---|",
    ...report.gates.map(
      (g) => `| ${g.label} | ${mark[g.status]} | ${g.detail} |`,
    ),
    "",
    "| Category | Passed |",
    "|---|---|",
    ...[...byCategory].map(([k, v]) => `| ${k} | ${v.passed} / ${v.total} |`),
    ...(failed.length
      ? [
          "",
          "**Failed:**",
          ...failed.map((r) => `- \`${r.id}\`: ${r.failures.join("; ")}`),
        ]
      : []),
    "",
  ].join("\n");
}
