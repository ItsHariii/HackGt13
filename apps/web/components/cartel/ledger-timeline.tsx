import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { HashPill } from "./hash-pill";

export type LedgerActor = "you" | "sys" | "ai" | "mer";

export type LedgerEntry = {
  seq: number;
  time: string;
  actor: LedgerActor;
  type: string;
  description: string;
  hash: string;
  /** A blocked execution, drawn as a red row with "✗ Blocked · no payment". */
  blocked?: boolean | undefined;
  /** Decoration beside the entry, e.g. the Inspector's thumbs-up. */
  extra?: ReactNode;
};

const ACTOR: Record<
  LedgerActor,
  { label: string; name: string; tone: string }
> = {
  you: {
    label: "YOU",
    name: "You",
    tone: "border-graphite bg-paper-sheet text-graphite",
  },
  sys: {
    label: "SYS",
    name: "Cartel engine",
    tone: "border-graphite bg-graphite text-paper-sheet",
  },
  ai: {
    label: "AI",
    name: "AI (pencil)",
    tone: "border-graphite border-dashed bg-paper-sheet text-muted",
  },
  mer: {
    label: "MER",
    name: "Merchant or payment network",
    tone: "border-graphite bg-paper-sheet text-ink",
  },
};

/** Every step of a plan, in order, each carrying its hash (Ledger design). */
export function LedgerTimeline({ entries }: { entries: LedgerEntry[] }) {
  return (
    <ol className="flex flex-col rounded-sheet border border-graphite bg-paper-sheet">
      {entries.map((e, i) => {
        const a = ACTOR[e.actor];
        return (
          <li
            key={e.seq}
            className={cn(
              "grid grid-cols-[72px_36px_minmax(0,1fr)] items-center gap-x-4 gap-y-2 px-4 py-3.5 text-graphite sm:grid-cols-[104px_44px_minmax(0,1fr)_auto] sm:px-[22px]",
              i > 0 && "border-rule-soft border-t",
              e.blocked &&
                "bg-red-pen-wash shadow-[inset_3px_0_0_var(--color-red-pen)]",
            )}
          >
            <time className="font-mono text-[13px] text-muted">{e.time}</time>
            <span
              title={a.name}
              className={cn(
                "flex size-9 items-center justify-center rounded-full border font-mono font-semibold text-[11px]",
                a.tone,
              )}
            >
              {a.label}
              <span className="sr-only"> ({a.name})</span>
            </span>
            <div className="flex min-w-0 flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2.5">
                <code
                  className={cn(
                    "font-mono font-semibold text-[14px]",
                    e.blocked && "text-red-pen",
                  )}
                >
                  {e.type}
                </code>
                <span className="text-[12px] text-muted">{a.name}</span>
                {e.blocked && (
                  <span className="inline-flex h-[22px] items-center gap-1 rounded-[4px] border border-red-pen px-[7px] font-semibold text-[12px] text-red-pen">
                    <span aria-hidden="true">✗</span> Blocked · no payment
                  </span>
                )}
              </div>
              <p
                className={cn(
                  "text-[14.5px] leading-[1.45]",
                  e.actor === "ai" && "text-muted",
                )}
              >
                {e.description}
              </p>
            </div>
            <div className="col-start-3 flex items-center justify-end gap-2.5 sm:col-start-auto">
              {e.extra}
              <HashPill hash={e.hash} />
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function LedgerLegend() {
  return (
    <ul className="flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-muted">
      {(Object.keys(ACTOR) as LedgerActor[]).map((k) => (
        <li key={k}>
          <span className="font-mono">{ACTOR[k].label}</span> {ACTOR[k].name}
        </li>
      ))}
    </ul>
  );
}
