import Link from "next/link";
import { cn } from "@/lib/utils";
import type { ProofRowView, ProofView, Tick } from "@/lib/workspace";
import {
  LiveProof,
  ProofInspector,
  ProofListInspector,
} from "./proof-inspector";
import { StatusIcon } from "./status-icon";

export const TICK: Record<Tick, string> = {
  pass: "border-green-check bg-green-check",
  fail: "border-red-pen bg-red-pen",
  waived: "border-graphite border-dashed bg-transparent",
  open: "border-pencil border-dashed bg-transparent",
};

const STATUS_TONE = {
  pass: "text-green-check",
  fail: "text-red-pen",
  est: "text-graphite",
  cant: "text-graphite",
} as const;

export function ProofPanel({
  planId,
  proof,
  activeId,
}: {
  planId: string;
  proof: ProofView;
  /** The row whose evidence is open, if any. */
  activeId?: string | undefined;
}) {
  return (
    <section
      aria-labelledby="proof-heading"
      className="relative flex min-h-0 flex-col rounded-card border border-rule bg-paper-raised shadow-stack-1"
    >
      <div className="flex flex-col gap-3 border-graphite border-b px-[22px] pt-[18px] pb-4">
        <div className="flex items-center justify-between">
          <h2
            id="proof-heading"
            className="font-bold text-meta uppercase tracking-label"
          >
            Proof
          </h2>
          <span className="flex items-center gap-2 text-meta text-muted">
            Deterministic engine · no AI
            <ProofInspector planId={planId} />
          </span>
        </div>
        <p
          aria-live="polite"
          className="font-serif font-semibold text-[24px] tracking-[-0.02em]"
        >
          {proof.headline}
        </p>
        <div
          aria-hidden="true"
          className="grid gap-[3px]"
          style={{
            gridTemplateColumns: `repeat(${proof.ticks.length}, minmax(0, 1fr))`,
          }}
        >
          {proof.ticks.map((t, i) => (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: ticks are positional
              key={i}
              className={cn("h-1.5 rounded-[1px] border", TICK[t])}
            />
          ))}
        </div>
        {proof.sub && <p className="text-muted text-small">{proof.sub}</p>}
        <LiveProof planId={planId} />
      </div>
      <div className="relative flex min-h-0 flex-col overflow-y-auto pt-1">
        <span
          aria-hidden="true"
          className="absolute top-0 bottom-0 left-[30px] border-[#c9c1af] border-l-[1.5px] border-dashed dark:border-[#4a5f80]"
        />
        <ProofListInspector planId={planId} hardRules={proof.ticks.length} />
        <ol className="flex flex-col">
          {proof.rows.map((r) => {
            const active = r.id === activeId;
            return (
              <li key={r.id} data-requirement-id={r.requirementId}>
                <Link
                  href={`/plans/${planId}/evidence/${encodeURIComponent(r.id)}`}
                  scroll={false}
                  aria-current={active ? "true" : undefined}
                  className={cn(
                    "relative grid grid-cols-[22px_minmax(0,1fr)_minmax(0,auto)] items-center gap-3 border-rule-soft border-b py-[13px] pr-[18px] pl-[60px] text-graphite no-underline hover:bg-paper",
                    active && "bg-ink/[0.06] hover:bg-ink/[0.08]",
                    r.kind === "fail" && "bg-red-pen-wash",
                  )}
                >
                  <span
                    aria-hidden="true"
                    className="absolute top-1/2 left-5 -mt-2.5 size-5 rounded-full bg-paper-raised"
                  />
                  <ProofRowBody row={r} />
                </Link>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

/** A proof row's mark, rule, status and evidence (the workspace and the live solve). */
export function ProofRowBody({ row }: { row: ProofRowView }) {
  return (
    <>
      <span className="relative">
        <StatusIcon kind={row.kind} />
      </span>
      <span className="flex min-w-0 flex-col gap-[3px]">
        <span className="font-semibold text-[14.5px] leading-[1.3]">
          {row.rule}
        </span>
        <span
          className={cn("font-semibold text-[12.5px]", STATUS_TONE[row.kind])}
        >
          {row.status}
        </span>
      </span>
      <span className="flex min-w-0 max-w-[16rem] flex-col items-end gap-1">
        <span
          className={cn(
            "max-w-full truncate font-mono text-[14px]",
            row.kind === "est" || row.kind === "cant"
              ? "text-muted"
              : row.kind === "fail"
                ? "mark-circle"
                : "text-ink",
          )}
        >
          {row.value}
        </span>
        <span
          title={row.evidence}
          className={cn(
            "max-w-full truncate rounded-[4px] border px-1.5 py-px font-semibold text-meta",
            row.evidenceTone === "ink"
              ? "border-ink text-ink"
              : "border-pencil border-dashed text-muted",
          )}
        >
          {row.evidence}
        </span>
      </span>
    </>
  );
}
