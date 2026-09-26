import Link from "next/link";
import { cn } from "@/lib/utils";
import { type CheckoutTier, CheckoutTierBadge } from "./checkout-tier-badge";

/** A candidate plan on a stacked sheet: label, total, rule count, tier. */
export function PlanCard({
  label,
  itemCount,
  total,
  passed,
  hardRules,
  tier,
  href,
  selected = false,
}: {
  label: string;
  itemCount: number;
  total: string;
  passed: number;
  hardRules: number;
  tier: CheckoutTier;
  href?: string | undefined;
  selected?: boolean | undefined;
}) {
  const allPass = passed === hardRules;
  const body = (
    <>
      <span className="flex items-baseline justify-between gap-3">
        <span className="font-semibold font-serif text-h4">{label}</span>
        <span className="num font-semibold text-[20px] text-ink">{total}</span>
      </span>
      <span className="text-muted text-small">
        {itemCount} {itemCount === 1 ? "item" : "items"} · delivered total
      </span>
      <span className="flex flex-wrap items-center justify-between gap-2 border-rule-soft border-t pt-3">
        <span
          className={cn(
            "font-semibold text-small",
            allPass ? "text-green-check" : "text-red-pen",
          )}
        >
          <span aria-hidden="true">{allPass ? "✓ " : "✗ "}</span>
          {passed} / {hardRules} hard rules pass
        </span>
        <CheckoutTierBadge tier={tier} />
      </span>
    </>
  );
  const cls = cn(
    "sheet flex flex-col gap-2 p-4 text-graphite shadow-stack",
    selected && "border-graphite",
  );
  return href ? (
    <Link
      href={href}
      aria-current={selected ? "true" : undefined}
      className={cn(cls, "hover:border-graphite")}
    >
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
