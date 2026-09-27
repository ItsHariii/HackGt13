import {
  FLAGSHIP_BRIEF,
  FLAGSHIP_REQUIREMENTS,
} from "@cartel/contracts/fixtures";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PlanHeader } from "@/components/plan/plan-header";
import {
  type Question,
  RequirementsEditor,
} from "@/components/requirements/requirements-editor";
import { AiOff } from "@/components/states/edge-states";
import { loadStoredPlan } from "@/lib/plans";
import { FLAGSHIP_PLAN } from "@/lib/workspace-data";

export const metadata: Metadata = { title: "Requirements" };

/** The design's one open question for the flagship brief. */
const FLAGSHIP_QUESTIONS: Question[] = [
  {
    id: "q_alcove",
    requirementId: "r_desk_width",
    text: "Is the 48-inch limit for the desk's width only, or width including a monitor arm?",
    options: [
      { label: "Desk width only", rule: "desk.width ≤ 48 in" },
      {
        label: "Including a monitor arm",
        rule: "desk.width + arm.reach ≤ 48 in",
      },
    ],
  },
];

/** Requirements review (TASKS T11.2; design "Brief and Requirements"). */
export default async function RequirementsPage({
  params,
}: PageProps<"/plans/[id]/requirements">) {
  const { id } = await params;
  const demo = id === FLAGSHIP_PLAN;
  const stored = demo ? null : await loadStoredPlan(id);
  if (!demo && !stored) notFound();
  const title = demo ? "Home office" : (stored?.title ?? "Plan");
  return (
    <div className="dot-grid min-h-dvh text-graphite">
      <PlanHeader title={title} step={2} demo={demo} tall />
      <main className="flex flex-col gap-11 px-5 pt-14 sm:px-16">
        <div className="flex flex-col gap-2">
          <h1 className="max-w-[820px] text-balance font-semibold font-serif text-[34px] leading-[1.1] tracking-[-0.03em] sm:text-[44px]">
            Here's what I understood. These are the rules I won't break without
            asking you.
          </h1>
        </div>
        {stored && stored.requirements.length === 0 && (
          <AiOff href="#manual-builder" />
        )}
        {demo ? (
          <RequirementsEditor
            planId={FLAGSHIP_PLAN}
            brief={FLAGSHIP_BRIEF}
            packIds={["home-office"]}
            initial={FLAGSHIP_REQUIREMENTS}
            questions={FLAGSHIP_QUESTIONS}
            mode="demo"
          />
        ) : (
          stored && (
            <RequirementsEditor
              planId={stored.id}
              brief={stored.brief}
              packIds={stored.packs.map((p) => p.id)}
              initial={stored.requirements}
              mode="stored"
            />
          )
        )}
      </main>
    </div>
  );
}
