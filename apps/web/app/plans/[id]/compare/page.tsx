import { Check, Minus, X } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PlanCard } from "@/components/cartel/plan-card";
import { Figure } from "@/components/doodle/figure";
import { PlanHeader } from "@/components/plan/plan-header";
import { StateCard } from "@/components/states/edge-states";
import { buildCompare, type CompareCell } from "@/lib/compare";
import { FLAGSHIP, flagshipCompare } from "@/lib/flagship";
import { loadStoredSolve } from "@/lib/stored-workspace";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Compare plans" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

function Cell({ cell }: { cell: CompareCell }) {
  const Icon =
    cell.status === "pass" || cell.status === "pref-met"
      ? Check
      : cell.status === "fail"
        ? X
        : Minus;
  const label =
    cell.status === "pass"
      ? "Pass"
      : cell.status === "fail"
        ? "Fail"
        : cell.status === "pref-met"
          ? "Preference met"
          : "Preference not met";
  return (
    <span className="flex items-center gap-2">
      <Icon
        size={16}
        strokeWidth={2.6}
        aria-hidden="true"
        className={cn(
          cell.status === "pass" && "text-green-check",
          cell.status === "fail" && "text-red-pen",
          cell.status.startsWith("pref") && "text-graphite",
        )}
      />
      <span className="flex flex-col">
        <span className="font-semibold text-small">{label}</span>
        <span className="num text-meta text-muted">{cell.text}</span>
      </span>
    </span>
  );
}

/** Compare (TASKS T11.5): plans side by side, one row per requirement. */
export default async function ComparePage({
  params,
  searchParams,
}: PageProps<"/plans/[id]/compare">) {
  const { id } = await params;
  const demo = id === FLAGSHIP;
  const stored = demo ? null : await loadStoredSolve(id);
  if (!demo && stored?.kind !== "solved" && stored?.kind !== "infeasible")
    notFound();
  const q = await searchParams;
  const budgetRaw = Number(one(q.budget));
  const budget =
    Number.isFinite(budgetRaw) && budgetRaw >= 100 && budgetRaw <= 100_000
      ? Math.round(budgetRaw)
      : undefined;
  const byRaw = one(q.by);
  const by =
    byRaw &&
    /^\d{4}-\d{2}-\d{2}$/.test(byRaw) &&
    !Number.isNaN(Date.parse(byRaw))
      ? byRaw
      : undefined;
  const view =
    stored?.kind === "solved" || stored?.kind === "infeasible"
      ? await buildCompare(stored.problem, stored.context, { budget, by })
      : await flagshipCompare({ budget, by });
  const changed = budget !== undefined || by !== undefined;
  const title = stored?.plan.title ?? "Home office";
  const limits =
    stored?.kind === "solved" || stored?.kind === "infeasible"
      ? stored.problem.limits
      : undefined;
  const defaultBudget = stored
    ? limits?.budget
      ? Math.ceil(limits.budget.maxTotalMinor / 100)
      : undefined
    : 1000;
  const defaultBy = stored ? limits?.delivery?.by : "2026-09-28";

  return (
    <div className="dot-grid min-h-dvh text-graphite">
      <PlanHeader
        back={{ href: `/plans/${id}`, label: title }}
        step={3}
        demo={demo}
      />
      <main className="mx-auto flex max-w-[1240px] flex-col gap-8 px-5 py-10 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-2">
            <p className="font-semibold text-meta text-muted uppercase tracking-label">
              {title} · Plans
            </p>
            <h1 className="font-semibold font-serif text-h3 tracking-heading sm:text-h2">
              Compare plans
            </h1>
            <p className="max-w-[60ch] text-graphite-2 text-ui">
              Each row is one of your rules. Plans come from the solver; item
              rules are checked before a product can enter a plan.
            </p>
          </div>
          <form
            method="get"
            className="flex flex-wrap items-end gap-3 text-small"
            aria-label="Try different limits"
          >
            <label className="flex flex-col gap-1">
              Budget (USD)
              <input
                name="budget"
                inputMode="numeric"
                defaultValue={budget ?? defaultBudget}
                className="num h-10 w-28 rounded-card border border-rule bg-paper-sheet px-2.5"
              />
            </label>
            <label className="flex flex-col gap-1">
              Arrive by
              <input
                name="by"
                type="date"
                defaultValue={by ?? defaultBy}
                className="h-10 rounded-card border border-rule bg-paper-sheet px-2.5"
              />
            </label>
            <button
              type="submit"
              className="h-10 rounded-card border border-graphite bg-paper-raised px-4 font-semibold"
            >
              Re-solve
            </button>
            {changed && (
              <Link
                href={`/plans/${id}/compare`}
                className="flex h-10 items-center text-ink underline underline-offset-4"
              >
                Reset
              </Link>
            )}
          </form>
        </div>

        {view.status === "conflict" ? (
          <div role="alert">
            <StateCard
              tone="fail"
              figure={<Figure who="inspector" pose="idle" h={88} />}
              eyebrow="No plan fits"
              title="No plan meets every hard rule."
              actions={view.actions.map((a) => (
                <Link
                  key={a.label}
                  href={`/plans/${id}/compare?${new URLSearchParams({
                    ...(budget !== undefined ? { budget: String(budget) } : {}),
                    ...(by ? { by } : {}),
                    ...a.query,
                  })}`}
                  className="inline-flex min-h-11 items-center rounded-card border border-graphite bg-paper-raised px-4 font-semibold text-ui hover:bg-paper"
                >
                  {a.label}
                </Link>
              ))}
            >
              {view.message}
            </StateCard>
          </div>
        ) : (
          <>
            <ul aria-label="Plans" className="grid gap-4 md:grid-cols-3">
              {view.plans.map((p, i) => {
                const hard = view.rows.filter((r) => r.kind === "hard");
                const passed = hard.filter(
                  (r) => r.cells[i]?.status === "pass",
                ).length;
                return (
                  <li key={p.label} className="flex flex-col gap-2">
                    <PlanCard
                      label={p.label}
                      itemCount={p.items.length}
                      total={p.total}
                      passed={passed}
                      hardRules={hard.length}
                      tier="full"
                      selected={i === 0}
                    />
                    <p className="px-1 text-graphite-2 text-small">
                      <span className="font-semibold">Tradeoff:</span>{" "}
                      {p.tradeoff}
                    </p>
                  </li>
                );
              })}
            </ul>

            <div
              // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrolling table must be reachable by keyboard (WCAG 2.1.1)
              tabIndex={0}
              className="relative overflow-x-auto"
            >
              <table className="sheet-formal w-full min-w-[720px] border-collapse text-left text-small">
                <caption className="pb-2 text-left font-semibold font-serif text-h4">
                  Rule by rule
                </caption>
                <thead className="text-meta text-muted uppercase tracking-label">
                  <tr className="border-rule border-b">
                    <th scope="col" className="px-3 py-2 font-semibold">
                      Requirement
                    </th>
                    {view.plans.map((p) => (
                      <th
                        key={p.label}
                        scope="col"
                        className="px-3 py-2 font-semibold"
                      >
                        {p.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {view.rows.map((r) => (
                    <tr
                      key={r.id}
                      className="border-rule-soft border-b last:border-0"
                    >
                      <th scope="row" className="px-3 py-2.5 font-semibold">
                        {r.rule}
                        <span className="ml-2 font-mono font-normal text-meta text-muted">
                          {r.kind === "hard" ? "HARD" : "PREF"}
                        </span>
                      </th>
                      {r.cells.map((c, i) => (
                        <td
                          // biome-ignore lint/suspicious/noArrayIndexKey: one cell per plan column
                          key={i}
                          className={cn(
                            "px-3 py-2.5",
                            c.status === "fail" && "bg-red-pen-wash",
                          )}
                        >
                          <Cell cell={c} />
                        </td>
                      ))}
                    </tr>
                  ))}
                  <tr className="border-rule border-t">
                    <th scope="row" className="px-3 py-2.5 font-semibold">
                      Items
                    </th>
                    {view.plans.map((p) => (
                      <td key={p.label} className="px-3 py-2.5 align-top">
                        <ul className="flex flex-col gap-1">
                          {p.items.map((it) => (
                            <li
                              key={it.role}
                              className="flex justify-between gap-3"
                            >
                              <span>
                                <span className="text-muted">{it.role}: </span>
                                {it.title}
                              </span>
                              <span className="num">{it.price}</span>
                            </li>
                          ))}
                        </ul>
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
