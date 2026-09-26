import { Lock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EvidenceBadge } from "@/components/cartel/evidence-badge";
import { HashPill } from "@/components/cartel/hash-pill";
import { LayersTable } from "@/components/cartel/layers-table";
import { Figure } from "@/components/doodle/figure";
import { Mark } from "@/components/paper/mark";
import { Stamp } from "@/components/paper/stamp";
import { StatusMark } from "@/components/paper/status-mark";
import { Announce } from "@/components/paused/announce";
import { PlanHeader } from "@/components/plan/plan-header";
import { Button } from "@/components/ui/button";
import { FLAGSHIP, flagshipPaused, TRAP_DIFF } from "@/lib/flagship";

export const metadata: Metadata = { title: "Purchase paused" };

/** Purchase Paused (TASKS T11.8; designs "Purchase Paused" + Blueprint + mobile). */
export default async function PausedPage({
  params,
}: PageProps<"/plans/[id]/diff/[diffId]">) {
  const { id, diffId } = await params;
  if (id !== FLAGSHIP || diffId !== TRAP_DIFF) notFound();
  const p = await flagshipPaused();
  return (
    <div data-blueprint className="dot-grid min-h-dvh text-graphite">
      <PlanHeader
        back={{ href: `/plans/${id}`, label: "Home office · Plan A" }}
        demo
        right={
          <span className="hidden items-center gap-2 text-small sm:flex">
            Contract v{p.version}
            <HashPill hash={p.contractHash} />
          </span>
        }
      />
      <Announce text={p.announcement} />
      <main className="mx-auto flex max-w-[1180px] flex-col gap-10 px-5 py-10 sm:px-8">
        <section
          aria-labelledby="paused-title"
          className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-center"
        >
          <div className="flex flex-col items-start gap-4">
            <h1 id="paused-title" className="-rotate-3 pb-4">
              <Stamp tone="paused" size="lg">
                PURCHASE PAUSED
              </Stamp>
            </h1>
            <p className="font-semibold font-serif text-h3 tracking-heading">
              No payment was made.
            </p>
            <p className="max-w-[60ch] text-body text-graphite-2">{p.lead}</p>
            <p className="num text-muted text-small">
              {p.when}
              {p.trigger ? ` · ${p.trigger}` : ""}
            </p>
          </div>
          <div className="relative flex items-end gap-2">
            <div className="sheet flex flex-1 flex-col gap-3 p-5">
              <p className="font-semibold text-meta text-muted uppercase tracking-label">
                GreatHub checkout
              </p>
              <p className="num font-semibold text-[28px]">{p.checkoutTotal}</p>
              <button
                type="button"
                disabled
                className="flex h-12 items-center justify-center gap-2 rounded-card border border-rule bg-rule-soft font-semibold text-muted"
              >
                <Lock size={16} aria-hidden="true" /> Pay {p.checkoutTotal}
              </button>
              <p className="font-semibold text-red-pen text-small">
                <span aria-hidden="true">✗ </span>Payment blocked
              </p>
            </div>
            <div aria-hidden="true" className="shrink-0">
              <Figure who="guard" pose="block" h={112} />
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <LayersTable
            layers={p.layers}
            caption="What was checked — 4 layers, in order"
          />
          <p className="text-graphite-2 text-small">
            Every payment check passed. The purchase still didn't match what you
            approved.
          </p>
        </section>

        {p.changed && (
          <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
            <table className="sheet-formal w-full border-collapse text-left text-small">
              <caption className="pb-2 text-left font-semibold font-serif text-h4">
                What changed — {p.changed.heading}
              </caption>
              <thead className="text-meta text-muted uppercase tracking-label">
                <tr className="border-rule border-b">
                  <th scope="col" className="px-3 py-2">
                    <span className="sr-only">Field</span>
                  </th>
                  <th scope="col" className="px-3 py-2 font-semibold">
                    Approved · v{p.version}
                  </th>
                  <th scope="col" className="px-3 py-2 font-semibold">
                    Current · checkout
                  </th>
                </tr>
              </thead>
              <tbody>
                {p.changed.rows.map((r) => (
                  <tr
                    key={r.label}
                    className="border-rule-soft border-b last:border-0"
                  >
                    <th scope="row" className="px-3 py-2.5 font-semibold">
                      {r.label}
                    </th>
                    <td className="num px-3 py-2.5">
                      {r.label === "Result" ? (
                        <StatusMark status="pass" />
                      ) : (
                        r.approved
                      )}
                    </td>
                    <td className="num px-3 py-2.5">
                      {r.label === "Result" ? (
                        <StatusMark status="fail" />
                      ) : r.failing ? (
                        <Mark type="circle">{r.current}</Mark>
                      ) : (
                        r.current
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <aside className="flex flex-col gap-2 rounded-card border border-pencil border-dashed bg-paper-raised p-4">
              <p className="font-semibold text-meta text-muted uppercase tracking-label">
                Summary
              </p>
              <p className="text-ui">{p.summary}</p>
              <p className="text-muted text-small">
                Written from a template. The tables are the record.
              </p>
            </aside>
          </section>
        )}

        <section
          aria-labelledby="alt-title"
          className="sheet flex flex-col gap-4 p-5 sm:p-6"
        >
          <div className="flex flex-col gap-1">
            <h2 id="alt-title" className="font-semibold font-serif text-h4">
              Compliant alternative
            </h2>
            <p className="text-muted text-small">
              Nothing changes until you sign a new version.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <p className="font-semibold text-ui">{p.alternative.title}</p>
              <p className="flex flex-wrap items-center gap-2 text-small">
                GreatHub · {p.alternative.spec}
                <EvidenceBadge level={p.alternative.evidence} />
              </p>
              <p className="font-semibold text-green-check text-small">
                <span aria-hidden="true">✓ </span>
                All {p.alternative.hardPass} checkable hard rules pass
                {p.alternative.waived
                  ? ` · ${p.alternative.waived} waived by you`
                  : ""}
              </p>
            </div>
            <p className="num font-semibold text-[22px] text-ink">
              {p.alternative.price}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <Button asChild>
              <Link href={`/plans/${id}/contract?review=1`}>
                Review revised contract
              </Link>
            </Button>
            <Link
              href={`/plans/${id}`}
              className="text-ink text-ui underline underline-offset-4"
            >
              Not now, keep it paused
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
