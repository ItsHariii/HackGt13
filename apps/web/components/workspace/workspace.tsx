import Link from "next/link";
import type { ReactNode } from "react";
import type { WorkspaceView } from "@/lib/workspace";
import { CommandBar } from "./command-bar";
import { PlanPanel } from "./plan-panel";
import { ProofPanel } from "./proof-panel";
import { RequirementsRail } from "./requirements-rail";
import { WorkspaceHeader } from "./workspace-header";
import { WorkspaceTabs } from "./workspace-tabs";

/** The plan workspace (TASKS T11.3; design "Workspace" + "Mobile Workspace"). */
export function Workspace({
  view,
  activeId,
  drawer,
}: {
  view: WorkspaceView;
  activeId?: string;
  /** Evidence rendered in place, for the full-page evidence route. */
  drawer?: ReactNode;
}) {
  const plan = view.plans[0];
  const passCount = view.proof.ticks.filter((t) => t === "pass").length;
  return (
    <div className="dot-grid flex min-h-dvh flex-col text-graphite xl:h-dvh">
      <WorkspaceHeader title={view.title} path={view.path} current={3} />
      <main className="relative flex min-h-0 flex-1 flex-col gap-4 px-4 pt-5 sm:px-6">
        <WorkspaceTabs
          rules={
            <RequirementsRail
              planId={view.planId}
              requirements={view.requirements}
            />
          }
          plan={
            <PlanPanel
              planId={view.planId}
              plans={view.plans}
              canReviewContract={view.canReviewContract}
              ctaNote={view.ctaNote}
            />
          }
          proof={
            <ProofPanel
              planId={view.planId}
              proof={view.proof}
              activeId={activeId}
            />
          }
        />
        {drawer}
      </main>
      <div className="shrink-0 px-4 pt-4 pb-5 sm:px-6">
        <CommandBar />
      </div>
      {plan && (
        <div className="sticky bottom-0 z-10 flex items-center gap-3 border-graphite border-t bg-paper-raised px-4 py-3 xl:hidden">
          <p className="flex-1 text-[14px]">
            <span className="num font-semibold">{plan.total}</span>
            {" · "}✓ {passCount}/{view.proof.ticks.length} pass
            {view.canReviewContract ? " · Ready to sign" : ""}
          </p>
          {view.canReviewContract && (
            <Link
              href={`/plans/${view.planId}/contract`}
              className="inline-flex h-11 items-center rounded-card bg-graphite px-4 font-semibold text-[15px] text-paper-raised"
            >
              Review contract
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
