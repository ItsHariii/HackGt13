import type { Metadata } from "next";
import { LiveBench } from "@/components/bench/live-bench";
import { StatusMark } from "@/components/paper/status-mark";
import { StateCard } from "@/components/states/edge-states";
import { LIVE_CASES } from "@/lib/bench-live";
import { formatStamp } from "@/lib/contract-view";
import { createClient } from "@/lib/supabase/server";

/** Reads the visitor's session and live data on every request. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "ProofBench" };

async function latestRun() {
  const db = await createClient();
  if (!db) return null;
  const { data } = await db
    .from("bench_runs")
    .select("git_sha,passed,total,created_at,results,gates")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

/** One scenario row as `pnpm bench` writes it (packages/bench/src/runner.ts). */
type Row = {
  id?: string;
  name?: string;
  category?: string;
  categoryLabel?: string;
  passed?: boolean;
  caught?: boolean;
  material?: boolean;
  expected?: string;
  actual?: string;
};
type Gate = {
  id?: string;
  label?: string;
  status?: "pass" | "fail" | "not_run";
  detail?: string;
};

const GATE_STATUS = {
  pass: { status: "pass", label: "Met" },
  fail: { status: "fail", label: "Missed" },
  not_run: { status: "unknown", label: "Not run" },
} as const;

/** ProofBench (TASKS T11.12, T16.3, T16.7; design "ProofBench"). */
export default async function BenchPage() {
  const run = await latestRun();
  const rows: Row[] = Array.isArray(run?.results) ? (run.results as Row[]) : [];
  const gates: Gate[] = Array.isArray(run?.gates) ? (run.gates as Gate[]) : [];
  const byCategory = new Map<
    string,
    { passed: number; total: number; material: number; stopped: number }
  >();
  for (const r of rows) {
    const k = r.categoryLabel ?? r.category ?? "Other";
    const v = byCategory.get(k) ?? {
      passed: 0,
      total: 0,
      material: 0,
      stopped: 0,
    };
    const ok = r.passed ?? r.caught ?? false;
    byCategory.set(k, {
      passed: v.passed + (ok ? 1 : 0),
      total: v.total + 1,
      material: v.material + (r.material ? 1 : 0),
      stopped: v.stopped + (r.material && ok ? 1 : 0),
    });
  }
  const failed = rows.filter((r) => !(r.passed ?? r.caught));
  const material = rows.filter((r) => r.material === true);
  const caught = material.filter((r) => r.passed ?? r.caught).length;
  const benign = rows.filter((r) => r.material === false);
  const falseBlocks = benign.filter(
    (r) => r.actual === "block" || r.actual === "reapprove",
  ).length;
  return (
    <main className="dot-grid min-h-[70vh] text-graphite">
      <div className="mx-auto flex max-w-[1180px] flex-col gap-10 px-5 py-12 sm:px-8">
        <div className="flex flex-col gap-2">
          <p className="font-semibold text-meta text-muted uppercase tracking-label">
            ProofBench
          </p>
          <h1 className="font-semibold font-serif text-h2 tracking-heading">
            {run
              ? `${caught} of ${material.length} caught · ${falseBlocks} false ${falseBlocks === 1 ? "block" : "blocks"}`
              : "Scripted attacks against GreatHub"}
          </h1>
          <p className="max-w-[62ch] text-body text-graphite-2">
            {run
              ? `${run.passed} of ${run.total} scenarios as expected in the last CI run, ${formatStamp(run.created_at)} · commit ${run.git_sha.slice(0, 7)}.`
              : "Every attack changes something about a checkout after you signed. The guard must stop the ones that break your contract and let the harmless ones through."}
          </p>
        </div>

        <LiveBench cases={LIVE_CASES} />

        {run ? (
          <>
            {gates.length > 0 && (
              <section
                aria-labelledby="gates-title"
                className="flex flex-col gap-3"
              >
                <h2
                  id="gates-title"
                  className="font-semibold font-serif text-h3"
                >
                  Release gates
                </h2>
                <ul className="sheet-formal flex flex-col divide-y divide-rule-soft">
                  {gates.map((g) => {
                    const s = GATE_STATUS[g.status ?? "not_run"];
                    return (
                      <li
                        key={g.id ?? g.label}
                        className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-baseline sm:gap-4"
                      >
                        <StatusMark
                          status={s.status}
                          label={s.label}
                          className="w-24 shrink-0"
                        />
                        <span className="font-semibold">{g.label}</span>
                        <span className="text-muted text-small sm:ml-auto">
                          {g.detail}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            <table className="sheet-formal w-full border-collapse text-left text-small">
              <caption className="pb-2 text-left font-semibold font-serif text-h4">
                Latest CI run by category
              </caption>
              <thead className="text-meta text-muted uppercase tracking-label">
                <tr className="border-rule border-b">
                  <th scope="col" className="px-3 py-2 font-semibold">
                    Category
                  </th>
                  <th
                    scope="col"
                    className="px-3 py-2 text-right font-semibold"
                  >
                    As expected
                  </th>
                  <th
                    scope="col"
                    className="px-3 py-2 text-right font-semibold"
                  >
                    Material stopped
                  </th>
                </tr>
              </thead>
              <tbody>
                {[...byCategory].map(([k, v]) => (
                  <tr
                    key={k}
                    className="border-rule-soft border-b last:border-0"
                  >
                    <th scope="row" className="px-3 py-2.5 font-semibold">
                      {k}
                    </th>
                    <td className="num px-3 py-2.5 text-right">
                      {v.passed} / {v.total}
                    </td>
                    <td className="num px-3 py-2.5 text-right">
                      {v.material === 0 ? "—" : `${v.stopped} / ${v.material}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {failed.length > 0 && (
              <section
                aria-labelledby="failed-title"
                className="flex flex-col gap-2"
              >
                <h2
                  id="failed-title"
                  className="font-semibold font-serif text-h4"
                >
                  Not as expected
                </h2>
                <ul className="flex flex-col gap-1 text-small">
                  {failed.map((r) => (
                    <li key={r.id}>
                      <StatusMark
                        status="fail"
                        hideLabel
                        className="mr-2 align-middle"
                      />
                      <span className="font-semibold">{r.name ?? r.id}</span>
                      <span className="text-muted">
                        {" "}
                        · expected {r.expected}, got {r.actual}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        ) : (
          <StateCard
            eyebrow="CI runs"
            title="No ProofBench run recorded yet."
            tone="dashed"
          >
            The full scenario suite runs in CI on every pull request, and each
            merge to main records its results here. The live attacks above use
            the real engine today.
          </StateCard>
        )}
      </div>
    </main>
  );
}
