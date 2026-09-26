import { ArrowUpRight, FileCheck2, ShieldCheck } from "lucide-react";
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

/** How far Cartel can take a purchase at this merchant (SDD §17.3). */
export function CheckoutTierBadge({
  tier,
  className,
}: {
  tier: CheckoutTier;
  className?: string | undefined;
}) {
  const t = TIER[tier];
  const Icon = t.icon;
  return (
    <span
      title={t.blurb}
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
}
