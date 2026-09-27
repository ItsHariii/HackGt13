import Link from "next/link";
import { CategoryIcon } from "@/components/category-icon";
import type { ProductView } from "@/lib/catalog";
import {
  ago,
  type CatchEntry,
  catchAuthor,
  catchHash,
  catchMessage,
} from "@/lib/catches";
import { AVAILABILITY_LABEL, deliveryLabel, returnLabel } from "@/lib/labels";
import { priceLabel, stockOf, unitsHeld } from "@/lib/shelf";
import { Crate } from "./icons";

const MAX_CHIPS = 4;

/**
 * One product in the full view: a mini porthole (the product page's photo
 * frame, shrunk), plain facts, and the latest catch on its SKUs as a footer
 * commit line, the way a repository card shows its last commit.
 */
export function ProductCard({
  product: p,
  lastCatch,
  index,
}: {
  product: ProductView;
  lastCatch: CatchEntry | undefined;
  index: number;
}) {
  const first = p.variants[0];
  if (!first) return null;
  const o = first.offer;
  const stock = stockOf(p);
  const options = p.variants
    .map((v) => v.optionLabel)
    .filter((x): x is string => Boolean(x));

  return (
    <li
      className="gh-shelf-item"
      style={{ "--i": index } as React.CSSProperties}
    >
      <Link
        href={`/p/${p.slug}`}
        className={`gh-pcard stock-${stock}${lastCatch ? " is-caught" : ""}`}
      >
        <div className="gh-pcard-media">
          <span className={`gh-pcard-stock stock-${stock}`}>
            <Crate size={13} />
            {AVAILABILITY_LABEL[stock]}
          </span>
          <span className="gh-pcard-porthole" aria-hidden="true">
            <span className="gh-rivet top" />
            <span className="gh-rivet bottom" />
            <span className="gh-rivet left" />
            <span className="gh-rivet right" />
            <span className="gh-pcard-glass">
              <CategoryIcon
                category={p.category}
                department={p.department}
                size={56}
              />
            </span>
          </span>
          <span className="gh-code gh-pcard-cat">{p.category}</span>
        </div>

        <div className="gh-pcard-body">
          <p className="gh-pcard-brand">{p.brand}</p>
          <h3 className="gh-pcard-name">{p.name}</h3>
          <p className="gh-code gh-pcard-price">{priceLabel(p)}</p>
          <p className="gh-pcard-meta">
            {stock === "out_of_stock"
              ? "Out of stock"
              : deliveryLabel(o.deliveryMinDays, o.deliveryMaxDays)}
            <span aria-hidden="true"> · </span>
            {returnLabel(o.returnPolicy.terms)}
          </p>
          {options.length > 1 ? (
            <ul className="gh-pcard-chips" aria-label="Options">
              {options.slice(0, MAX_CHIPS).map((label) => (
                <li key={label} className="gh-code">
                  {label}
                </li>
              ))}
              {options.length > MAX_CHIPS ? (
                <li className="gh-code gh-muted">
                  +{options.length - MAX_CHIPS}
                </li>
              ) : null}
            </ul>
          ) : null}
        </div>

        <div className="gh-pcard-catch gh-code">
          <span
            className={
              lastCatch && catchAuthor(lastCatch) === "the-gull"
                ? "gh-avatar gull"
                : "gh-avatar"
            }
            aria-hidden="true"
          />
          <span className="gh-ellipsis">
            {lastCatch
              ? catchMessage(lastCatch)
              : stock === "out_of_stock"
                ? "empty hold: out of stock"
                : `restock: ${unitsHeld(p)} units docked`}
          </span>
          {lastCatch ? (
            <span className="gh-muted gh-nowrap">
              {catchHash(lastCatch.id)} · {ago(lastCatch.created_at)}
            </span>
          ) : null}
        </div>
      </Link>
    </li>
  );
}
