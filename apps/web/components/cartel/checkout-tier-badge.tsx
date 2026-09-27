import { ArrowUpRight, FileCheck2, Info, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

export type CheckoutTier = "full" | "handoff" | "proof";

export const TIER: Record<
  CheckoutTier,
  { label: string; blurb: string; icon: typeof ShieldCheck }
> = {
  full: {
    label: "Full Cartel checkout",
    blurb: "Re-checks, then pays within your contract.",
    icon: ShieldCheck,
  },
  handoff: {
    label: "Hand off to store",
    blurb: "Re-checks, then the store's checkout decides.",
    icon: ArrowUpRight,
  },
  proof: {
    label: "Proof only",
    blurb: "Proves the rules. You buy elsewhere.",
    icon: FileCheck2,
  },
};

/**
 * How far Cartel can take a purchase at this merchant (SDD §17.3). With
 * `explain`, an info button shows what the tier means on hover, focus or
 * tap (TASKS T11.20); the text is also its accessible description.
 */
export function CheckoutTierBadge({
  tier,
  explain = false,
  className,
}: {
  tier: CheckoutTier;
  explain?: boolean | undefined;
  className?: string | undefined;
}) {
  const t = TIER[tier];
  const Icon = t.icon;
  const badge = (
    <span
      title={explain ? undefined : t.blurb}
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-[5px] px-2 py-0.5 font-semibold text-meta",
        tier === "full"
          ? "bg-graphite text-paper-raised"
          : tier === "handoff"
            ? "border border-graphite text-graphite"
            : "border border-pencil border-dashed text-muted",
        className,
      )}
    >
      <Icon size={12} strokeWidth={2.2} aria-hidden="true" />
      {t.label}
    </span>
  );
  if (!explain) return badge;
  return (
    <span className="group/tier relative inline-flex items-center gap-1">
      {badge}
      <button
        type="button"
        aria-label={`${t.label}: ${t.blurb}`}
        className="relative z-10 inline-flex size-6 items-center justify-center rounded-pill text-muted hover:bg-paper hover:text-graphite"
      >
        <Info size={13} aria-hidden="true" />
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-0 z-30 mb-1.5 hidden w-60 rounded-card border border-graphite bg-paper-raised p-2.5 font-normal text-graphite text-small shadow-page group-focus-within/tier:block group-hover/tier:block"
      >
        <span className="block font-semibold">{t.label}</span>
        {t.blurb}
      </span>
    </span>
  );
}
