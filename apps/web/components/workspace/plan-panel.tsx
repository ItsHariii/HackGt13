"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type KeyboardEvent, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { PlanView } from "@/lib/workspace";

function ShieldIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      aria-hidden="true"
    >
      <path d="M8 1.5l5.5 2v4c0 3.3-2.4 5.9-5.5 7-3.1-1.1-5.5-3.7-5.5-7v-4z" />
    </svg>
  );
}

export function PlanPanel({
  planId,
  plans,
  canReviewContract,
  ctaNote,
  hrefs,
  initial = 0,
  contractHref,
}: {
  planId: string;
  plans: PlanView[];
  canReviewContract: boolean;
  ctaNote: string;
  /** Saved plans: each tab opens its own proof, so switching navigates. */
  hrefs?: string[];
  initial?: number;
  contractHref?: string;
}) {
  const router = useRouter();
  const [active, setActiveState] = useState(initial);
  const setActive = (i: number) => {
    setActiveState(i);
    const href = hrefs?.[i];
    if (href) router.replace(href, { scroll: false });
  };
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const base = useId();
  const plan = plans[active] ?? plans[0];
  if (!plan) return null;

  const onKey = (e: KeyboardEvent) => {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (active + step + plans.length) % plans.length;
    setActive(next);
    tabs.current[next]?.focus();
  };

  return (
    <section aria-label="Plans" className="flex min-h-0 flex-col gap-3.5">
      <div role="tablist" aria-label="Plans" className="flex items-end gap-1.5">
        {plans.map((p, i) => {
          const selected = i === active;
          return (
            <button
              key={p.id}
              ref={(el) => {
                tabs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`${base}-tab-${p.id}`}
              aria-selected={selected}
              aria-controls={`${base}-panel`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(i)}
              onKeyDown={onKey}
              className={cn(
                "relative -mb-[15px] rounded-t-card border border-b-0 font-sans",
                selected
                  ? "z-[1] h-11 border-graphite border-b border-b-paper-raised bg-paper-raised px-[18px] font-semibold text-[15px]"
                  : "h-[38px] border-rule bg-transparent px-4 font-medium text-[14px] text-graphite-2",
              )}
            >
              {p.label}
            </button>
          );
        })}
      </div>
      <div
        role="tabpanel"
        id={`${base}-panel`}
        aria-labelledby={`${base}-tab-${plan.id}`}
        className="flex min-h-0 flex-1 flex-col rounded-[0_8px_8px_8px] border border-graphite bg-paper-raised shadow-stack"
      >
        <div className="flex items-center justify-between px-6 pt-[18px] pb-3.5">
          <h2 className="font-bold text-meta uppercase tracking-label">
            Your plan
          </h2>
          <span className="inline-flex h-[26px] items-center gap-1.5 rounded-[5px] bg-graphite px-2.5 font-semibold text-[12.5px] text-paper-raised">
            <ShieldIcon />
            {plan.tierLabel}
          </span>
        </div>
        <ul
          // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrolling pane must be reachable by keyboard (WCAG 2.1.1)
          tabIndex={0}
          aria-label="Plan items"
          className="flex min-h-0 flex-col overflow-y-auto px-6"
        >
          {plan.items.map((it) => (
            <li
              key={`${it.role}-${it.title}`}
              className="grid grid-cols-[56px_minmax(0,1fr)_auto] items-center gap-3.5 border-rule-soft border-t py-3 sm:grid-cols-[64px_56px_minmax(0,1fr)_auto]"
            >
              <span className="col-span-3 font-semibold text-meta text-muted uppercase tracking-[0.06em] sm:col-span-1">
                {it.role}
              </span>
              {it.imageUrl ? (
                // biome-ignore lint/performance/noImgElement: merchant image hosts vary per catalog source; next/image would need each one configured.
                <img
                  src={it.imageUrl}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="h-12 w-14 rounded-sheet border border-rule bg-paper object-cover"
                />
              ) : (
                <span
                  aria-hidden="true"
                  className="h-12 w-14 rounded-sheet border border-rule bg-[repeating-linear-gradient(135deg,#f3eee2_0_5px,#ece5d6_5px_10px)] dark:bg-[repeating-linear-gradient(135deg,#1f3352_0_5px,#223556_5px_10px)]"
                />
              )}
              <span className="flex min-w-0 flex-col gap-1">
                <span className="font-semibold text-[15px] leading-[1.3]">
                  {it.title}
                  {it.changed && (
                    <span className="ml-2 inline-flex h-[20px] items-center rounded-[4px] bg-tape/80 px-1.5 align-middle font-semibold text-graphite text-meta">
                      Changed
                    </span>
                  )}
                </span>
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-muted text-small">
                  <span className="whitespace-nowrap font-mono text-ink">
                    {it.spec}
                  </span>
                  <span className="inline-flex h-[22px] items-center whitespace-nowrap rounded-pill border border-rule bg-paper px-2 text-graphite text-meta">
                    {it.merchant}
                  </span>
                </span>
              </span>
              <span className="num font-medium text-[16px] text-ink">
                {it.price}
              </span>
            </li>
          ))}
        </ul>
        <div className="flex-1" />
        <dl className="mx-6 grid grid-cols-[1fr_auto] items-center gap-x-6 gap-y-2 border-graphite border-t pt-4 pb-[18px] text-[15px]">
          <dt>Merchandise</dt>
          <dd className="num text-right">{plan.merchandise}</dd>
          <dt>Shipping</dt>
          <dd className="num text-right">{plan.shipping}</dd>
          <dt className="flex items-center gap-2 text-muted">
            Est. tax
            <span className="rounded-[4px] border border-pencil border-dashed px-1.5 py-px font-semibold text-meta">
              ~ Estimate
            </span>
          </dt>
          <dd className="num rounded-[4px] border border-pencil border-dashed px-1 text-right text-muted">
            {plan.tax}
          </dd>
          <dt className="border-rule-soft border-t pt-2.5 font-bold text-[16px]">
            Delivered total
          </dt>
          <dd className="num border-rule-soft border-t pt-2.5 text-right font-semibold text-[22px]">
            {plan.total}
          </dd>
        </dl>
        <div className="flex flex-wrap items-center gap-3 rounded-b-card border-rule border-t bg-paper-shade px-6 py-3.5">
          <p className="flex-1 text-muted text-small">{ctaNote}</p>
          {canReviewContract ? (
            <Link
              href={contractHref ?? `/plans/${planId}/contract`}
              className="inline-flex h-11 items-center rounded-card bg-graphite px-5 font-semibold text-[15px] text-paper-raised shadow-primary hover:opacity-90"
            >
              Review contract
            </Link>
          ) : (
            <button
              type="button"
              disabled
              className="h-11 rounded-card border border-rule bg-rule-soft px-5 font-semibold text-[15px] text-muted"
            >
              Review contract
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
