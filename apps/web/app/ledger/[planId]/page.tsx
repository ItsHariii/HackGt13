import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  type LedgerEntry,
  LedgerLegend,
  LedgerTimeline,
} from "@/components/cartel/ledger-timeline";
import { Figure } from "@/components/doodle/figure";
import { VerifyChain } from "@/components/ledger/verify-chain";
import { PlanHeader } from "@/components/plan/plan-header";
import {
  FLAGSHIP,
  FLAGSHIP_TITLE,
  flagshipLedger,
  ledgerActor,
  ledgerTime,
} from "@/lib/flagship";
import type { LedgerRecord } from "@/lib/ledger";
import { storedLedger } from "@/lib/ledger-data";

export const metadata: Metadata = { title: "Ledger" };

/** The plan ledger (TASKS T11.10; design "Ledger"). */
export default async function LedgerPage({
  params,
}: PageProps<"/ledger/[planId]">) {
  const { planId } = await params;
  const demo = planId === FLAGSHIP;
  let title: string;
  let records: LedgerRecord[];
  let entries: LedgerEntry[];
  if (demo) {
    const rows = await flagshipLedger();
    title = FLAGSHIP_TITLE;
    records = rows.map(
      ({ display: _d, time: _t, description: _x, blocked: _b, ...r }) => r,
    );
    entries = rows.map((r) => ({
      seq: r.seq,
      time: r.time,
      actor: r.display,
      type: r.type,
      description: r.description,
      hash: r.hash,
      blocked: r.blocked,
      extra:
        r.type === "change.auto_accepted" ? <AutoAcceptedThumb /> : undefined,
    }));
  } else {
    const stored = await storedLedger(planId);
    if (!stored) notFound();
    title = stored.title;
    records = stored.records;
    entries = records.map((r) => ({
      seq: r.seq,
      time: ledgerTime(r.createdAt),
      actor: ledgerActor(r.actor),
      type: r.type,
      description: r.payloadText === "{}" ? "" : r.payloadText,
      hash: r.hash,
      blocked: r.type === "execution.blocked",
      extra:
        r.type === "change.auto_accepted" ? <AutoAcceptedThumb /> : undefined,
    }));
  }
  return (
    <div className="dot-grid min-h-dvh text-graphite">
      <PlanHeader
        back={{ href: `/plans/${planId}`, label: title }}
        demo={demo}
      />
      <main className="mx-auto flex max-w-[1040px] flex-col gap-8 px-5 pt-14 pb-20 sm:px-10">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="flex flex-1 flex-col gap-2">
            <h1 className="font-semibold font-serif text-[44px] tracking-[-0.03em]">
              Ledger
            </h1>
            <p className="text-[17px] text-graphite-2">
              Every step of this plan, in order. Each entry includes the hash of
              the one before it. Times are UTC.
            </p>
          </div>
          <VerifyChain records={records} />
        </div>
        {entries.length === 0 ? (
          <p className="sheet p-5 text-muted">No ledger entries yet.</p>
        ) : (
          <>
            <LedgerTimeline entries={entries} />
            <LedgerLegend />
          </>
        )}
      </main>
    </div>
  );
}

/** Auto-accepted change (SDD §17.9): the Inspector's thumbs-up; the entry's text says it. */
function AutoAcceptedThumb() {
  return (
    <span aria-hidden="true" className="block">
      <Figure who="inspector" pose="thumbs" h={48} />
    </span>
  );
}
