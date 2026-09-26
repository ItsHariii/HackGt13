import { cn } from "@/lib/utils";

export type EvidenceLevel =
  | "confirmed"
  | "manufacturer"
  | "seller"
  | "catalog"
  | "suggests"
  | "estimate"
  | "cant"
  | "disagree";

/** Ink = a source stated it; dashed pencil = inferred; red = conflict. */
const LEVEL: Record<EvidenceLevel, { label: string; tone: string }> = {
  confirmed: {
    label: "Confirmed",
    tone: "border-ink bg-ink text-paper-raised",
  },
  manufacturer: { label: "Manufacturer says", tone: "border-ink text-ink" },
  seller: { label: "Seller says", tone: "border-ink text-ink" },
  catalog: { label: "Catalog says", tone: "border-ink text-ink" },
  suggests: {
    label: "Evidence suggests",
    tone: "border-pencil border-dashed text-muted",
  },
  estimate: {
    label: "~ Estimate",
    tone: "border-pencil border-dashed text-muted",
  },
  cant: { label: "? Can't check", tone: "border-graphite text-graphite" },
  disagree: {
    label: "≠ Sources disagree",
    tone: "border-red-pen text-red-pen",
  },
};

/**
 * Who says so, and when (Style Tile v2 evidence chips), e.g.
 * "Confirmed · Merchant checkout · 12 s ago".
 */
export function EvidenceBadge({
  level,
  detail,
  className,
}: {
  level: EvidenceLevel;
  /** Source and age, appended after a middle dot. */
  detail?: string | undefined;
  className?: string | undefined;
}) {
  const l = LEVEL[level];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-[4px] border px-1.5 py-px font-semibold text-meta",
        l.tone,
        className,
      )}
    >
      {l.label}
      {detail && <span className="font-normal">· {detail}</span>}
    </span>
  );
}
