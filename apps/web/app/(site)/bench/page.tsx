import type { Metadata } from "next";
import { LiveBench } from "@/components/bench/live-bench";
import { Figure } from "@/components/doodle/figure";
import { StatusMark } from "@/components/paper/status-mark";
import { StateCard } from "@/components/states/edge-states";
import { LIVE_CASES } from "@/lib/bench-live";
import { formatStamp } from "@/lib/contract-view";
import { createClient } from "@/lib/supabase/server";

/** Reads the visitor's session and live data on every request. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "ProofBench" };

/** Gremlin vs. Guard (ProofBench design): three of the attacks the suite runs. */
const STRIP = [
  {
    pose: "swap",
    trick: "Gremlin swaps a price tag on the same SKU",
    caught: "Blocked · cart hash mismatch",
  },
  {
    pose: "edit",
    trick: "Gremlin edits USB-C power 90 W → 15 W",
    caught: "Blocked · rule ≥ 65 W fails",
  },
  {
    pose: "idle",
    trick: "Gremlin hides “ignore your rules” in the listing text",
    caught: "Blocked · untrusted text ignored",
  },
] as const;

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
      <div className="mx-auto flex max-w-[1200px] flex-col gap-10 px-5 pt-14 pb-20 sm:px-10">
        <div className="flex flex-col gap-3">
          <h1 className="font-semibold font-serif text-[44px] tracking-[-0.03em]">
            ProofBench
          </h1>
          {run ? (
            <p className="flex flex-wrap items-baseline gap-x-[18px] gap-y-1">
              <span className="font-mono font-semibold text-[52px] leading-none tracking-[-0.04em] sm:text-[72px]">
                {caught} / {material.length}
              </span>
              <span className="font-semibold font-serif text-[30px]">
                caught
              </span>
              <span className="text-[22px] text-graphite-2">
                · <span className="font-mono">{falseBlocks}</span> false{" "}
                {falseBlocks === 1 ? "block" : "blocks"}
              </span>
            </p>
          ) : (
            <p className="font-semibold font-serif text-[30px]">
              Scripted attacks against GreatHub
            </p>
          )}
          <p className="text-[14px] text-muted">
            {run
              ? `Scripted attacks against GreatHub. ${run.passed} of ${run.total} scenarios as expected in the last CI run, ${formatStamp(run.created_at)} · commit ${run.git_sha.slice(0, 7)}.`
              : "Every attack changes something about a checkout after you signed. The guard must stop the ones that break your contract and let the harmless ones through."}
          </p>
        </div>

        <ul className="grid gap-5 md:grid-cols-3">
          {STRIP.map((s) => (
            <li
              key={s.trick}
              className="flex flex-col gap-3 rounded-card border border-rule bg-paper-raised px-5 pt-[18px] pb-4 shadow-stack-1"
            >
              <div
                aria-hidden="true"
                className="flex h-[130px] items-end justify-between border-rule border-b px-2.5 pb-1"
              >
                <Figure who="gremlin" pose={s.pose} h={110} />
                <Figure who="guard" pose="block" h={110} />
              </div>
              <span className="font-semibold text-[15px]">{s.trick}</span>
              <span className="flex items-center gap-1.5 text-[13.5px]">
                <StatusMark status="fail" hideLabel size={14} label="Blocked" />
                {s.caught}
              </span>
            </li>
          ))}
        </ul>

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

            <table className="w-full rounded-sheet border border-graphite bg-paper-sheet text-left">
              <caption className="pb-3 text-left font-semibold font-serif text-[22px]">
                Latest CI run by category
              </caption>
              <thead>
                <tr className="border-graphite border-b font-semibold text-[11.5px] text-muted tracking-[0.08em] [&>th]:px-[22px] [&>th]:py-2.5">
                  <th scope="col" className="w-[200px] font-semibold">
                    CATEGORY
                  </th>
                  <th scope="col" className="font-semibold">
                    CASES
                  </th>
                  <th scope="col" className="w-[90px] text-right font-semibold">
                    RESULT
                  </th>
                  <th scope="col" className="w-[150px] font-semibold">
                    OUTCOME
                  </th>
                </tr>
              </thead>
              <tbody>
                {[...byCategory].map(([k, v]) => {
                  const benign = v.material === 0;
                  const ok = v.passed === v.total;
                  return (
                    <tr
                      key={k}
                      className="border-rule-soft border-t [&>*]:px-[22px] [&>*]:py-3"
                    >
                      <th scope="row" className="font-medium text-[15px]">
                        {k}
                      </th>
                      <td>
                        <span
                          aria-hidden="true"
                          className="flex flex-wrap gap-[3px]"
                        >
                          {Array.from({ length: v.total }, (_, i) => (
                            <span
                              // biome-ignore lint/suspicious/noArrayIndexKey: one cell per case
                              key={i}
                              className={`h-3.5 w-[22px] rounded-[2px] ${
                                i < v.passed
                                  ? benign
                                    ? "bg-ink"
                                    : "bg-green-check"
                                  : "bg-red-pen"
                              }`}
                            />
                          ))}
                        </span>
                      </td>
                      <td className="text-right font-mono text-[14px]">
                        {v.passed}/{v.total}
                      </td>
                      <td>
                        <StatusMark
                          status={ok ? "pass" : "fail"}
                          size={14}
                          className={`text-[13.5px] ${ok && benign ? "text-ink" : ""}`}
                          label={!ok ? "Missed" : benign ? "Allowed" : "Caught"}
                        />
                      </td>
                    </tr>
                  );
                })}
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
