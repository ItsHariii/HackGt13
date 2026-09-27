import type { Metadata } from "next";
import Link from "next/link";
import { GuardStepper } from "@/components/cartel/guard-stepper";
import { Stamp } from "@/components/paper/stamp";
import { CheckoutPanel } from "@/components/payments/checkout-panel";
import { PlanHeader } from "@/components/plan/plan-header";
import { FLAGSHIP, flagshipGuardRuns } from "@/lib/flagship";

export const metadata: Metadata = { title: "Checkout" };

/**
 * The checkout guard (TASKS T11.7): Refresh cart → Re-fetch specs →
 * Re-prove → Diff → Guard → Pay → Order. Saved plans run the real guard;
 * the demo plan shows its two recorded runs.
 */
export default async function CheckoutPage({
  params,
}: PageProps<"/plans/[id]/checkout">) {
  const { id } = await params;
  if (id !== FLAGSHIP) return <CheckoutPanel planId={id} />;
  const runs = await flagshipGuardRuns();
  return (
    <div className="dot-grid min-h-dvh text-graphite">
      <PlanHeader
        back={{ href: `/plans/${id}`, label: "Home office · Plan A" }}
        demo
      />
      <main className="mx-auto flex max-w-[1080px] flex-col gap-8 px-5 py-10 sm:px-8">
        <div className="flex flex-col gap-2">
          <p className="font-semibold text-meta text-muted uppercase tracking-label">
            Contract → checkout
          </p>
          <h1 className="font-semibold font-serif text-h2 tracking-heading">
            One last check.
          </h1>
          <p className="max-w-[62ch] text-body text-graphite-2">
            Before any payment, Cartel refreshes the cart and the product specs,
            re-proves every signed rule, and compares the result with the
            contract. The guard pays only if nothing you approved changed for
            the worse.
          </p>
        </div>
        <ol className="flex flex-col gap-6">
          {runs.map((run) => (
            <li
              key={run.title}
              className="sheet flex flex-col gap-5 p-5 sm:p-6"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-semibold font-serif text-h4">
                    {run.title}
                  </h2>
                  <p className="num text-muted text-small">{run.when}</p>
                </div>
                <Stamp
                  tone={run.outcome === "paid" ? "paid" : "blocked"}
                  size="sm"
                >
                  {run.outcome === "paid" ? "PAID" : "BLOCKED"}
                </Stamp>
              </div>
              <GuardStepper
                steps={run.steps}
                label={`Guard steps: ${run.title}`}
              />
              <Link
                href={run.href}
                className="w-fit text-ink text-ui underline underline-offset-4"
              >
                {run.outcome === "paid"
                  ? "View the receipt"
                  : "See why it paused"}
              </Link>
            </li>
          ))}
        </ol>
      </main>
    </div>
  );
}
