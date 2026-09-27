"use client";
import { X } from "lucide-react";
import Link from "next/link";
import { useId, useRef } from "react";
import {
  CheckoutTierBadge,
  TIER,
} from "@/components/cartel/checkout-tier-badge";
import { CompareTray, PlanTray } from "@/components/cartel/trays";
import { StatusMark } from "@/components/paper/status-mark";
import { trays, trayTotal, useTrays } from "@/lib/tray-store";

/**
 * The global trays (TASKS T11.19): the compare tray (up to four products →
 * rule-by-rule compare) and the plan tray, whose "Open" shows a bottom
 * sheet with the items, the rules you added and a live pass/fail summary.
 */
export function GlobalTrays() {
  const t = useTrays();
  const sheet = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const pass = t.items.reduce((n, i) => n + i.pass, 0);
  const fail = t.items.reduce((n, i) => n + i.fail, 0);
  const tiers = new Set(t.items.map((i) => i.tier));
  const compareHref = `/compare?ids=${t.compare.map((c) => encodeURIComponent(c.id)).join(",")}`;
  return (
    <div className="sticky bottom-0 z-20">
      {t.compare.length > 0 && (
        <CompareTray
          items={t.compare}
          onRemove={(id) => {
            const entry = t.compare.find((c) => c.id === id);
            if (entry) trays.toggleCompare(entry, false);
          }}
          href={compareHref}
        />
      )}
      <PlanTray
        count={t.items.length}
        total={trayTotal(t.items)}
        onOpen={() => sheet.current?.showModal()}
      />
      <dialog
        ref={sheet}
        aria-labelledby={titleId}
        className="fixed inset-x-0 top-auto bottom-0 m-0 max-h-[85dvh] w-full max-w-none rounded-t-[16px] border border-graphite bg-paper-raised p-0 text-graphite backdrop:bg-graphite/40 open:flex open:flex-col"
      >
        <div className="mx-auto flex w-full max-w-[860px] items-center justify-between border-rule border-b px-5 py-3">
          <h2 id={titleId} className="font-semibold font-serif text-h4">
            Your plan tray
          </h2>
          <button
            type="button"
            onClick={() => sheet.current?.close()}
            aria-label="Close plan tray"
            className="inline-flex size-11 items-center justify-center rounded-card hover:bg-paper"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="mx-auto flex w-full max-w-[860px] flex-col gap-5 overflow-y-auto px-5 py-4">
          {t.items.length === 0 && t.rules.length === 0 ? (
            <p className="text-muted text-ui">
              Nothing yet. Use “Add to plan” on a product, or “Add as rule” on a
              filter or spec.
            </p>
          ) : (
            <>
              <p aria-live="polite" className="font-semibold text-ui">
                {fail > 0 ? (
                  <StatusMark
                    status="fail"
                    label={`${fail} hard rule check${fail === 1 ? "" : "s"} fail · ${pass} pass`}
                  />
                ) : (
                  <StatusMark
                    status="pass"
                    label={`${pass} hard rule checks pass`}
                  />
                )}
              </p>
              {t.items.length > 0 && (
                <ul className="flex flex-col divide-y divide-rule-soft">
                  {t.items.map((i) => (
                    <li
                      key={i.productId}
                      className="flex flex-wrap items-center gap-3 py-2.5"
                    >
                      <span className="w-20 font-semibold text-meta text-muted uppercase tracking-label">
                        {i.role}
                      </span>
                      <Link
                        href={`/p/${encodeURIComponent(i.productId)}`}
                        className="flex-1 font-semibold text-ui hover:underline"
                      >
                        {i.title}
                      </Link>
                      <CheckoutTierBadge tier={i.tier} />
                      <span className="num">{i.price}</span>
                      <button
                        type="button"
                        onClick={() => trays.removeItem(i.productId)}
                        aria-label={`Remove ${i.title}`}
                        className="inline-flex size-9 items-center justify-center rounded-card border border-rule"
                      >
                        <X size={14} aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {tiers.size > 1 && (
                <p className="rounded-card border border-pencil border-dashed p-3 text-small">
                  These items span checkout tiers:{" "}
                  {[...tiers].map((x) => TIER[x].label).join(", ")}. Each
                  merchant gets its own contract and checkout; proof-only items
                  are proved but bought elsewhere.
                </p>
              )}
              {t.rules.length > 0 && (
                <div className="flex flex-col gap-2">
                  <h3 className="font-semibold text-meta text-muted uppercase tracking-label">
                    Rules you chose
                  </h3>
                  <ul className="flex flex-wrap gap-2">
                    {t.rules.map((r) => (
                      <li
                        key={r.id}
                        className="inline-flex items-center gap-1 rounded-pill border border-ink py-0.5 pr-1 pl-3 text-ink text-small"
                      >
                        {r.text}
                        <button
                          type="button"
                          onClick={() => trays.removeRule(r.id)}
                          aria-label={`Remove rule ${r.text}`}
                          className="inline-flex size-6 items-center justify-center rounded-pill hover:bg-ink/10"
                        >
                          <X size={12} aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
          <div className="flex flex-wrap items-center gap-3 border-rule border-t pt-4">
            <Link
              href="/plans/flagship/contract"
              className="inline-flex h-11 items-center rounded-card bg-graphite px-4 font-semibold text-paper-raised shadow-primary"
            >
              Review contract
            </Link>
            <p className="flex-1 text-muted text-small">
              The tray is a scratchpad in this browser. Contracts come from a
              plan; this opens the demo plan's contract.
            </p>
            {(t.items.length > 0 || t.rules.length > 0) && (
              <button
                type="button"
                onClick={() => trays.clear()}
                className="text-ink text-small underline underline-offset-4"
              >
                Clear tray
              </button>
            )}
          </div>
        </div>
      </dialog>
    </div>
  );
}
