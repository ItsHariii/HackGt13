"use client";
import { useId } from "react";
import { type CheckoutTier, CheckoutTierBadge } from "./checkout-tier-badge";
import { EvidenceBadge, type EvidenceLevel } from "./evidence-badge";

export type ProductCardData = {
  id: string;
  name: string;
  price: string;
  /** One headline fact, e.g. "100% linen". */
  fact?: string | undefined;
  evidence: EvidenceLevel;
  source: string;
  tier: CheckoutTier;
  href?: string | undefined;
};

/** A search result (Search design): name, price, fact with receipt, source, tier. */
export function ProductCard({
  product,
  compared = false,
  onCompare,
}: {
  product: ProductCardData;
  compared?: boolean | undefined;
  onCompare?: (id: string, on: boolean) => void;
}) {
  const id = useId();
  return (
    <article
      aria-labelledby={`${id}-name`}
      className="sheet relative flex flex-col gap-2 p-3.5 text-graphite"
    >
      <div
        aria-hidden="true"
        className="mb-1 h-28 rounded-sheet sm:h-36 border border-rule-soft bg-[repeating-linear-gradient(135deg,var(--color-paper)_0_6px,var(--color-paper-shade)_6px_12px)]"
      />
      <h3
        id={`${id}-name`}
        className="font-sans font-semibold text-ui leading-snug tracking-normal"
      >
        {product.href ? (
          <a href={product.href} className="after:absolute after:inset-0">
            {product.name}
          </a>
        ) : (
          product.name
        )}
      </h3>
      <p className="num font-semibold text-[17px] text-ink">{product.price}</p>
      {product.fact && (
        <p className="flex flex-wrap items-center gap-1.5 text-small">
          {product.fact}
          <EvidenceBadge level={product.evidence} />
        </p>
      )}
      <p className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
        <span className="rounded-pill border border-rule px-2 py-px text-meta text-muted">
          {product.source}
        </span>
        <CheckoutTierBadge tier={product.tier} explain />
      </p>
      {onCompare && (
        <label className="relative z-10 flex min-h-6 w-fit items-center gap-2 text-small">
          <input
            type="checkbox"
            checked={compared}
            onChange={(e) => onCompare(product.id, e.target.checked)}
            className="size-4 accent-ink"
          />
          Compare
        </label>
      )}
    </article>
  );
}
