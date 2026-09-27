"use client";
import { X } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * The bottom tray on search and product pages: "Your plan · 0 items —
 * Add products or rules to start a plan. — Open".
 */
export function PlanTray({
  count,
  total,
  href,
  onOpen,
  className,
}: {
  count: number;
  total?: string | undefined;
  /** Where "Open" goes, or… */
  href?: string | undefined;
  /** …what it does, e.g. open a bottom sheet. */
  onOpen?: (() => void) | undefined;
  className?: string | undefined;
}) {
  return (
    <aside
      aria-label="Your plan"
      className={cn(
        "flex items-center gap-4 border-graphite border-t bg-paper-raised px-4 py-3 text-graphite",
        className,
      )}
    >
      <p className="flex-1 text-small">
        <span className="font-semibold">Your plan</span>
        {" · "}
        <span className="num">{count}</span> {count === 1 ? "item" : "items"}
        {total && (
          <>
            {" · "}
            <span className="num font-semibold text-ink">{total}</span>
          </>
        )}
        {count === 0 && (
          <span className="hidden text-muted sm:inline">
            {" — "}Add products or rules to start a plan.
          </span>
        )}
      </p>
      {onOpen ? (
        <button
          type="button"
          onClick={onOpen}
          aria-haspopup="dialog"
          className="inline-flex h-10 items-center rounded-card border border-graphite px-4 font-semibold text-ui hover:bg-paper"
        >
          Open
        </button>
      ) : (
        <Link
          href={href ?? "#"}
          className="inline-flex h-10 items-center rounded-card border border-graphite px-4 font-semibold text-ui hover:bg-paper"
        >
          Open
        </Link>
      )}
    </aside>
  );
}

export type CompareItem = { id: string; name: string; price: string };

/** Up to four products picked with "Compare", then compared side by side. */
export function CompareTray({
  items,
  max = 4,
  onRemove,
  href,
  className,
}: {
  items: CompareItem[];
  max?: number | undefined;
  onRemove: (id: string) => void;
  href: string;
  className?: string | undefined;
}) {
  if (items.length === 0) return null;
  return (
    <aside
      aria-label="Compare"
      className={cn(
        "flex flex-wrap items-center gap-3 border-graphite border-t bg-paper-raised px-4 py-3 text-graphite",
        className,
      )}
    >
      <p className="font-semibold text-small">
        Compare <span className="num">{items.length}</span> / {max}
      </p>
      <ul className="flex flex-1 flex-wrap gap-2">
        {items.map((it) => (
          <li
            key={it.id}
            className="inline-flex h-8 items-center gap-1.5 rounded-pill border border-rule bg-paper-sheet pr-1 pl-3 text-small"
          >
            <span className="max-w-[18ch] truncate">{it.name}</span>
            <span className="num text-ink">{it.price}</span>
            <button
              type="button"
              onClick={() => onRemove(it.id)}
              aria-label={`Remove ${it.name} from compare`}
              className="inline-flex size-6 items-center justify-center rounded-pill text-muted hover:bg-paper hover:text-graphite"
            >
              <X size={13} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
      <Link
        href={href}
        aria-disabled={items.length < 2}
        className={cn(
          "inline-flex h-10 items-center rounded-card bg-graphite px-4 font-semibold text-paper-raised text-ui shadow-primary",
          items.length < 2 && "pointer-events-none opacity-50",
        )}
      >
        Compare {items.length}
      </Link>
    </aside>
  );
}
