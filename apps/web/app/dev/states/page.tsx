import type { Metadata } from "next";
import { EvidenceBadge } from "@/components/cartel/evidence-badge";
import { Figure } from "@/components/doodle/figure";
import { Mark } from "@/components/paper/mark";
import { StatusMark } from "@/components/paper/status-mark";
import { AiOff, EmptyPlan, StateCard } from "@/components/states/edge-states";
import { StatesDemo } from "./states-demo";

export const metadata: Metadata = {
  title: "Edge states",
  robots: { index: false },
};

/** The Edge States design (TASKS T11.14), each as the screens render it. */
export default function StatesPage() {
  return (
    <main className="dot-grid min-h-dvh text-graphite">
      <div className="mx-auto flex max-w-[960px] flex-col gap-6 px-5 py-10">
        <h1 className="font-semibold font-serif text-h2 tracking-heading">
          Edge states
        </h1>
        <EmptyPlan />
        <StateCard
          figure={<Figure who="scout" pose="map" h={80} />}
          eyebrow="404"
          title="This page wandered off."
        >
          Shown by any unknown route.
        </StateCard>
        <StatesDemo />
        <StateCard
          tone="fail"
          figure={<Figure who="inspector" pose="idle" h={80} />}
          eyebrow="No plan fits"
          title="No plan meets every hard rule."
        >
          Rendered on Compare from the solver's conflict set, with one relax
          button per member (try /plans/flagship/compare?budget=800).
        </StateCard>
        <StateCard
          eyebrow="Sources disagree"
          title="≠ Sources disagree · Desk width"
        >
          <span className="flex flex-col gap-3">
            <Mark type="bracket">
              <span className="grid gap-2 sm:grid-cols-2">
                <span className="flex flex-col gap-1 rounded-card border border-rule p-3">
                  <span className="num font-semibold">46.5 in</span>
                  <EvidenceBadge
                    level="manufacturer"
                    detail="Spec sheet · 2 min ago"
                  />
                </span>
                <span className="flex flex-col gap-1 rounded-card border border-rule p-3">
                  <span className="num font-semibold">49 in</span>
                  <EvidenceBadge
                    level="seller"
                    detail="GreatHub listing · 12 s ago"
                  />
                </span>
              </span>
            </Mark>
            <span>
              Rule “Desk width ≤ 48 in” is marked{" "}
              <StatusMark status="unknown" /> until one source is confirmed.
            </span>
          </span>
        </StateCard>
        <StateCard eyebrow="Hand off to store" title="✓ Re-checked at 10:42">
          Re-checked at 10:42. After this, the store's checkout decides.
        </StateCard>
        <AiOff href="/plans/flagship/requirements#manual-builder" />
      </div>
    </main>
  );
}
