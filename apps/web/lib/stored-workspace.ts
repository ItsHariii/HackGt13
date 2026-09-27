import "server-only";
import { ProofReport } from "@cartel/contracts";
import type { CheckoutState } from "@cartel/proof-engine";
import type { ConflictSet, SolverProblem } from "@cartel/solver";
import type { CompareContext } from "./compare";
import { ALL_PACKS } from "./evidence";
import { loadStoredPlan, type StoredPlan } from "./plans";
import { createClient } from "./supabase/server";
import { buildWorkspace, type WorkspaceView } from "./workspace";

/*
 * A saved plan's latest solve, read through the shopper's own session (RLS):
 * Plans A–C as the workspace shows them, or why there are none yet. Nothing
 * here re-proves; every number comes from the stored report and the
 * checkout state it was proved against.
 */

export type SolveContext = CompareContext & {
  tradeoffs: Record<string, string>;
};

export type StoredSolve =
  | { kind: "none"; plan: StoredPlan }
  | { kind: "stale"; plan: StoredPlan }
  | {
      kind: "infeasible";
      plan: StoredPlan;
      conflict: ConflictSet;
      problem: SolverProblem;
      context: SolveContext;
    }
  | {
      kind: "solved";
      plan: StoredPlan;
      view: WorkspaceView;
      problem: SolverProblem;
      context: SolveContext;
    };

const LABEL = /^[A-Z]$/;

export async function loadStoredSolve(
  planId: string,
  wanted?: string,
): Promise<StoredSolve | null> {
  const plan = await loadStoredPlan(planId);
  if (!plan) return null;
  const db = await createClient();
  if (!db) return null;
  const [set, run] = await Promise.all([
    db
      .from("requirement_sets")
      .select("id")
      .eq("plan_id", plan.id)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db
      .from("solver_runs")
      .select("id,set_id,status,conflict_set,problem,context")
      .eq("plan_id", plan.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (!run.data?.problem || !run.data.context) return { kind: "none", plan };
  if (run.data.set_id !== set.data?.id) return { kind: "stale", plan };
  const problem = run.data.problem as unknown as SolverProblem;
  const context = run.data.context as unknown as SolveContext;
  if (run.data.status === "infeasible") {
    const conflict = (run.data.conflict_set as unknown as ConflictSet[])[0];
    return conflict
      ? { kind: "infeasible", plan, conflict, problem, context }
      : { kind: "none", plan };
  }

  const baskets = await db
    .from("baskets")
    .select("id,label,proof_reports(report,checkout_state,created_at)")
    .eq("solver_run_id", run.data.id)
    .order("label");
  const solved = (baskets.data ?? []).flatMap((b) => {
    const latest = [...(b.proof_reports ?? [])].sort((x, y) =>
      x.created_at < y.created_at ? 1 : -1,
    )[0];
    const report = ProofReport.safeParse(latest?.report);
    if (!latest?.checkout_state || !report.success || !LABEL.test(b.label))
      return [];
    return [
      {
        label: b.label,
        checkout: latest.checkout_state as unknown as CheckoutState,
        report: report.data,
      },
    ];
  });
  if (solved.length === 0) return { kind: "none", plan };

  const path = `/plans/${plan.id}`;
  const views = solved.map((s) =>
    buildWorkspace({
      planId: plan.id,
      title: plan.title,
      path,
      planLabel: `Plan ${s.label} · ${context.tradeoffs[s.label] ?? "Plan"}`,
      requirements: plan.requirements,
      checkout: s.checkout,
      report: s.report,
      packs: plan.packs.length > 0 ? plan.packs : ALL_PACKS,
      waivers: [],
    }),
  );
  const active = Math.max(
    0,
    solved.findIndex((s) => s.label === wanted),
  );
  const view = views[active] as WorkspaceView;
  const label = solved[active]?.label ?? "A";
  // A hard rule nothing could check can still be accepted as a waiver when
  // drafting; only a failing one keeps the contract closed.
  const failing = view.proof.rows.some((r) => r.hard && r.kind === "fail");
  const open = view.proof.rows.some((r) => r.hard && r.kind === "cant");
  return {
    kind: "solved",
    plan,
    problem,
    context,
    view: {
      ...view,
      // Evidence links carry no plan label; the open plan's rows win.
      evidence: Object.assign(
        {},
        ...views.map((v) => v.evidence),
        view.evidence,
      ),
      plans: views.map((v, i) => ({
        ...(v.plans[0] as WorkspaceView["plans"][number]),
        id: (solved[i]?.label ?? "a").toLowerCase(),
        label: `Plan ${solved[i]?.label}`,
      })),
      planHrefs: solved.map((s) => `${path}?plan=${s.label}`),
      activePlan: active,
      contractHref: `${path}/contract/new?plan=${label}`,
      canReviewContract: !failing,
      ctaNote: failing
        ? "A hard rule fails. Edit the rules or pick another plan."
        : open
          ? "Every hard rule passes or can be accepted as can't check. Review the exact contract next."
          : view.ctaNote,
    },
  };
}
