import Link from "next/link";
import { STATUS, type Status } from "@/lib/status";
import { cn } from "@/lib/utils";
import { EvidenceBadge, type EvidenceLevel } from "./evidence-badge";

export type ProofRowData = {
  id: string;
  rule: string;
  status: Exclude<Status, "info">;
  /** Overrides the status label, e.g. "Can't check · waived". */
  statusLabel?: string | undefined;
  value: string;
  evidence: EvidenceLevel;
  evidenceDetail?: string | undefined;
};

/**
 * One hard rule with its verdict, the value it was checked against and the
 * evidence behind it. With `href`, the row opens the evidence drawer.
 */
export function ProofRow({
  row,
  href,
  active = false,
}: {
  row: ProofRowData;
  href?: string | undefined;
  active?: boolean | undefined;
}) {
  const Icon = STATUS[row.status].icon;
  const body = (
    <>
      <Icon
        size={18}
        strokeWidth={2.6}
        aria-hidden="true"
        className={STATUS[row.status].text}
      />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="font-semibold text-[14.5px] leading-snug">
          {row.rule}
        </span>
        <span
          className={cn("font-semibold text-[12.5px]", STATUS[row.status].text)}
        >
          {row.statusLabel ?? STATUS[row.status].label}
        </span>
      </span>
      <span className="flex flex-col items-end gap-1">
        <span
          className={cn(
            "num text-[14px]",
            row.status === "fail"
              ? "mark-circle"
              : row.status === "pass"
                ? "text-ink"
                : "text-muted",
          )}
        >
          {row.value}
        </span>
        <EvidenceBadge level={row.evidence} detail={row.evidenceDetail} />
      </span>
    </>
  );
  const cls = cn(
    "grid grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-3 border-rule-soft border-b px-4 py-3 text-graphite",
    row.status === "fail" && "bg-red-pen-wash",
    active && "bg-ink/[0.06]",
  );
  return (
    <li>
      {href ? (
        <Link
          href={href}
          scroll={false}
          aria-current={active ? "true" : undefined}
          className={cn(cls, "hover:bg-paper")}
        >
          {body}
        </Link>
      ) : (
        <div className={cls}>{body}</div>
      )}
    </li>
  );
}

export type Tick = "pass" | "fail" | "waived" | "open";
const TICK: Record<Tick, string> = {
  pass: "border-green-check bg-green-check",
  fail: "border-red-pen bg-red-pen",
  waived: "border-graphite border-dashed",
  open: "border-pencil border-dashed",
};

/** The proof headline ("8 of 9 hard rules pass") with one tick per hard rule. */
export function ProofSummary({
  ticks,
  sub,
  headingLevel: H = "p",
}: {
  ticks: Tick[];
  sub?: string | undefined;
  headingLevel?: "p" | "h2" | "h3";
}) {
  const pass = ticks.filter((t) => t === "pass").length;
  const fail = ticks.filter((t) => t === "fail").length;
  const headline =
    fail > 0
      ? `${fail} of ${ticks.length} hard rules fail`
      : `${pass} of ${ticks.length} hard rules pass`;
  return (
    <div className="flex flex-col gap-2.5">
      <H
        aria-live="polite"
        className={cn(
          "font-semibold font-serif text-[24px] tracking-[-0.02em]",
          fail > 0 && "text-red-pen",
        )}
      >
        {headline}
      </H>
      <div
        aria-hidden="true"
        className="grid gap-[3px]"
        style={{
          gridTemplateColumns: `repeat(${Math.max(ticks.length, 1)}, minmax(0, 1fr))`,
        }}
      >
        {ticks.map((t, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: ticks are positional
          <span key={i} className={cn("h-1.5 rounded-[1px] border", TICK[t])} />
        ))}
      </div>
      {sub && <p className="text-muted text-small">{sub}</p>}
    </div>
  );
}
