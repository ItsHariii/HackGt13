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
  /** Source and age of the fact's receipt, e.g. "GreatHub · 2 min ago". */
  evidenceDetail?: string | undefined;
  source: string;
  tier: CheckoutTier;
  href?: string | undefined;
  /** The seller's product photo; the striped placeholder shows without one. */
  imageUrl?: string | null | undefined;
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
      className="relative flex flex-col overflow-hidden rounded-card border border-rule bg-paper-raised text-graphite shadow-[2px_2px_0_-1px_#f4eedf,2px_2px_0_0_var(--color-rule),0_14px_24px_-20px_rgb(43_42_40/.4)] dark:shadow-none"
    >
      {product.imageUrl ? (
        <div className="h-[168px] overflow-hidden border-rule border-b bg-paper sm:h-[300px]">
          {/* biome-ignore lint/performance/noImgElement: merchant image hosts vary per catalog source; next/image would need each one configured. */}
          <img
            src={product.imageUrl}
            alt=""
            loading="lazy"
            decoding="async"
            className="size-full object-cover"
          />
        </div>
      ) : (
        <div
          aria-hidden="true"
          className="flex h-[168px] items-center justify-center border-rule border-b bg-[repeating-linear-gradient(135deg,#f3eee2_0_10px,#ece5d6_10px_20px)] sm:h-[300px] dark:bg-[repeating-linear-gradient(135deg,#1f3352_0_10px,#223556_10px_20px)]"
        >
          <span className="rounded-[4px] bg-paper px-2 py-[3px] font-mono text-[12px] text-muted">
            product photo
          </span>
        </div>
      )}
      {onCompare && (
        <label className="absolute top-3 left-3 z-10 flex h-[30px] items-center gap-[7px] rounded-[6px] border border-rule bg-paper-raised pr-2.5 pl-2 font-medium text-[13px]">
          <input
            type="checkbox"
            checked={compared}
            onChange={(e) => onCompare(product.id, e.target.checked)}
            className="size-4 accent-ink"
          />
          Compare
        </label>
      )}
      <div className="flex flex-1 flex-col gap-2.5 px-3 pt-3 pb-3.5 sm:px-[18px] sm:pt-4 sm:pb-[18px]">
        <div className="flex flex-col justify-between gap-1 sm:flex-row sm:items-baseline sm:gap-3">
          <h3
            id={`${id}-name`}
            className="font-sans font-semibold text-[14px] leading-[1.3] tracking-normal sm:text-[16px]"
          >
            {product.href ? (
              <a
                href={product.href}
                className="text-graphite no-underline after:absolute after:inset-0 hover:underline"
              >
                {product.name}
              </a>
            ) : (
              product.name
            )}
          </h3>
          <p className="num shrink-0 font-medium text-[15px] text-ink sm:text-[17px]">
            {product.price}
          </p>
        </div>
        {product.fact && (
          <p className="flex flex-wrap items-center gap-2 text-[12.5px] sm:text-[14px]">
            <span className="font-medium text-ink">{product.fact}</span>
            <EvidenceBadge
              level={product.evidence}
              detail={product.evidenceDetail}
            />
          </p>
        )}
        <p className="mt-auto flex flex-wrap items-center gap-1.5 border-rule-soft border-t pt-3">
          <span className="inline-flex h-[26px] items-center rounded-pill border border-rule bg-paper px-2.5 text-[12.5px]">
            {product.source}
          </span>
          <CheckoutTierBadge tier={product.tier} explain />
        </p>
      </div>
    </article>
  );
}
