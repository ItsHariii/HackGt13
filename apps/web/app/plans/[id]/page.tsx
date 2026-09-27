import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PlanHeader } from "@/components/plan/plan-header";
import { NotSolvedYet, StateCard } from "@/components/states/edge-states";
import { SolveButton } from "@/components/workspace/solve-button";
import { Workspace } from "@/components/workspace/workspace";
import { loadStoredSolve } from "@/lib/stored-workspace";
import { FLAGSHIP_PLAN, loadWorkspace } from "@/lib/workspace-data";

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export async function generateMetadata({
  params,
}: PageProps<"/plans/[id]">): Promise<Metadata> {
  const view = await loadWorkspace((await params).id);
  return { title: view ? `${view.title} · Plans` : "Plan" };
}

export default async function PlanPage({
  params,
  searchParams,
}: PageProps<"/plans/[id]">) {
  const { id } = await params;
  const q = await searchParams;
  if (id === FLAGSHIP_PLAN) {
    const view = await loadWorkspace(id);
    if (!view) notFound();
    return <Workspace view={view} />;
  }
  const solve = await loadStoredSolve(id, one(q.plan));
  if (!solve) notFound();
  if (solve.kind === "solved") return <Workspace view={solve.view} />;
  const { plan } = solve;
  const canSolve = plan.requirements.length > 0;
  return (
    <div className="dot-grid min-h-dvh text-graphite">
      <PlanHeader title={plan.title} step={3} />
      <main className="mx-auto flex max-w-[760px] flex-col gap-6 px-5 py-16">
        {solve.kind === "infeasible" && (
          <StateCard
            tone="fail"
            eyebrow="No plan fits every hard rule"
            title="The last search found a conflict."
            headingLevel="h2"
            actions={
              <Link
                href={`/plans/${plan.id}/compare`}
                className="inline-flex min-h-11 items-center rounded-card border border-graphite bg-paper-raised px-4 font-semibold text-ui hover:bg-paper"
              >
                See the conflict
              </Link>
            }
          >
            Compare shows which limits clash and the smallest change that fixes
            each one.
          </StateCard>
        )}
        <NotSolvedYet
          planId={plan.id}
          title={plan.title}
          ruleCount={plan.requirements.length}
          stale={solve.kind === "stale"}
          {...(canSolve
            ? {
                solve: (
                  <SolveButton
                    planId={plan.id}
                    autoStart={
                      one(q.solve) === "1" && solve.kind !== "infeasible"
                    }
                  />
                ),
              }
            : {})}
        />
      </main>
    </div>
  );
}
