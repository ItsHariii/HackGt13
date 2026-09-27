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
    tone: "border-graphite bg-graphite text-paper-raised",
  },
  ai: {
    label: "AI",
    name: "AI",
    tone: "border-pencil border-dashed text-muted",
  },
  mer: {
    label: "MER",
    name: "Merchant or payment network",
    tone: "border-ink text-ink",
  },
};

/** Every step of a plan, in order, each carrying its hash (Ledger design). */
export function LedgerTimeline({ entries }: { entries: LedgerEntry[] }) {
  return (
    <ol className="flex flex-col">
      {entries.map((e) => {
        const a = ACTOR[e.actor];
        return (
          <li
            key={e.seq}
            className={cn(
              "grid grid-cols-[64px_48px_minmax(0,1fr)] gap-x-3 gap-y-1 border-rule-soft border-b px-3 py-3 text-graphite sm:grid-cols-[72px_52px_minmax(0,1fr)_auto]",
              e.blocked &&
                "bg-red-pen-wash shadow-[inset_3px_0_0_var(--color-red-pen)]",
            )}
          >
            <time className="num pt-0.5 text-muted text-small">{e.time}</time>
            <span
              title={a.name}
              className={cn(
                "inline-flex h-6 w-fit items-center rounded-[4px] border px-1.5 font-mono font-semibold text-[11px]",
                a.tone,
              )}
            >
              {a.label}
              <span className="sr-only"> ({a.name})</span>
            </span>
            <div className="flex min-w-0 flex-col gap-0.5">
              <code className="num font-semibold text-small">{e.type}</code>
              <p className="text-small">{e.description}</p>
              {e.extra}
              {e.blocked && (
                <p className="font-semibold text-red-pen text-small">
                  <span aria-hidden="true">✗ </span>Blocked · no payment
                </p>
              )}
            </div>
            <div className="col-start-3 sm:col-start-auto">
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
    <ul className="flex flex-wrap gap-x-4 gap-y-2 text-muted text-small">
      {(Object.keys(ACTOR) as LedgerActor[]).map((k) => (
        <li key={k} className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className={cn(
              "inline-flex h-5 items-center rounded-[4px] border px-1 font-mono font-semibold text-[10px]",
              ACTOR[k].tone,
            )}
          >
            {ACTOR[k].label}
          </span>
          {ACTOR[k].name}
        </li>
      ))}
    </ul>
  );
}
