import type { Metadata } from "next";
import { LiveBench } from "@/components/bench/live-bench";
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
    .select("git_sha,passed,total,created_at,results")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

/** ProofBench (TASKS T11.12; design "ProofBench"). */
export default async function BenchPage() {
  const run = await latestRun();
  const rows = Array.isArray(run?.results)
    ? (run.results as { category?: string; caught?: boolean }[])
    : [];
  const byCategory = new Map<string, { caught: number; total: number }>();
  for (const r of rows) {
    const k = r.category ?? "Other";
    const v = byCategory.get(k) ?? { caught: 0, total: 0 };
    byCategory.set(k, {
      caught: v.caught + (r.caught ? 1 : 0),
      total: v.total + 1,
    });
  }
  return (
    <main className="dot-grid min-h-[70vh] text-graphite">
      <div className="mx-auto flex max-w-[1180px] flex-col gap-10 px-5 py-12 sm:px-8">
        <div className="flex flex-col gap-2">
          <p className="font-semibold text-meta text-muted uppercase tracking-label">
            ProofBench
          </p>
          <h1 className="font-semibold font-serif text-h2 tracking-heading">
            {run
              ? `${run.passed} / ${run.total} caught`
              : "Scripted attacks against GreatHub"}
          </h1>
          <p className="max-w-[62ch] text-body text-graphite-2">
            {run
              ? `Last CI run ${formatStamp(run.created_at)} · commit ${run.git_sha.slice(0, 7)}.`
              : "Every attack changes something about a checkout after you signed. The guard must stop the ones that break your contract and let the harmless ones through."}
          </p>
        </div>

        <LiveBench cases={LIVE_CASES} />

        {run ? (
          <table className="sheet-formal w-full border-collapse text-left text-small">
            <caption className="pb-2 text-left font-semibold font-serif text-h4">
              Latest CI run by category
            </caption>
            <thead className="text-meta text-muted uppercase tracking-label">
              <tr className="border-rule border-b">
                <th scope="col" className="px-3 py-2 font-semibold">
                  Category
                </th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">
                  Caught
                </th>
              </tr>
            </thead>
            <tbody>
              {[...byCategory].map(([k, v]) => (
                <tr key={k} className="border-rule-soft border-b last:border-0">
                  <th scope="row" className="px-3 py-2.5 font-semibold">
                    {k}
                  </th>
                  <td className="num px-3 py-2.5 text-right">
                    {v.caught} / {v.total}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <StateCard
            eyebrow="CI runs"
            title="No ProofBench run recorded yet."
            tone="dashed"
          >
            The full scenario suite runs in CI once ProofBench lands (TASKS
            Phase 16); its results appear here. The live attacks above use the
            real engine today.
          </StateCard>
        )}
      </div>
    </main>
  );
}
