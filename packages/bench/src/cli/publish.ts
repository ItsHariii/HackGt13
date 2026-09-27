import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import type { BenchReport } from "../report";

/*
 * `pnpm bench:publish [--in dir]`: upserts `results.json` into `bench_runs`
 * (one row per commit) so /bench shows the latest CI run. CI runs it on
 * pushes to `main` only, with SUPABASE_URL and SUPABASE_SECRET_KEY from the
 * repository secrets; without them it says so and exits cleanly.
 */

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const cwd = process.env.INIT_CWD ?? process.cwd();
  const file = resolve(cwd, arg("in") ?? "bench-results", "results.json");
  const report = JSON.parse(readFileSync(file, "utf8")) as BenchReport;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    console.log(
      "SUPABASE_URL or SUPABASE_SECRET_KEY is not set; skipping the bench_runs upsert.",
    );
    return;
  }
  if (!report.gitSha || !/^[0-9a-f]{7,40}$/.test(report.gitSha)) {
    throw new Error(`results.json has no usable git SHA (${report.gitSha})`);
  }
  const db = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await db.from("bench_runs").upsert(
    {
      git_sha: report.gitSha,
      results: report.results,
      gates: report.gates,
      passed: report.passed,
      total: report.total,
      created_at: report.createdAt,
    },
    { onConflict: "git_sha" },
  );
  if (error) throw new Error(`bench_runs upsert failed: ${error.message}`);
  console.log(
    `Published ${report.passed}/${report.total} for ${report.gitSha.slice(0, 7)} to bench_runs.`,
  );
}

await main();
