import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PlanHeader } from "@/components/plan/plan-header";
import { NotSolvedYet } from "@/components/states/edge-states";
import { Workspace } from "@/components/workspace/workspace";
import { loadStoredPlan } from "@/lib/plans";
import { loadWorkspace } from "@/lib/workspace-data";

export async function generateMetadata({
  params,
}: PageProps<"/plans/[id]">): Promise<Metadata> {
  const view = await loadWorkspace((await params).id);
  return { title: view ? `${view.title} · Plans` : "Plan" };
}

export default async function PlanPage({ params }: PageProps<"/plans/[id]">) {
  const { id } = await params;
  const view = await loadWorkspace(id);
  if (view) return <Workspace view={view} />;
  const stored = await loadStoredPlan(id);
  if (!stored) notFound();
  return (
    <div className="dot-grid min-h-dvh text-graphite">
      <PlanHeader step={3} />
      <main className="mx-auto max-w-[760px] px-5 py-16">
        <NotSolvedYet
          planId={stored.id}
          title={stored.title}
          ruleCount={stored.requirements.length}
        />
      </main>
    </div>
  );
}
