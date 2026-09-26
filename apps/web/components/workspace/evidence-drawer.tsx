"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import type { EvidenceView } from "@/lib/workspace";
import { StatusIcon } from "./status-icon";

const FOCUSABLE =
  'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Evidence for one proof row (TASKS T11.4). As an intercepted route it
 * closes with history back, so focus returns to the row that opened it;
 * as a full page it links back to the plan.
 */
export function EvidenceDrawer({
  evidence,
  closeHref,
  mode,
}: {
  evidence: EvidenceView;
  closeHref: string;
  mode: "overlay" | "page";
}) {
  const router = useRouter();
  const dialog = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const opener =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    closeButton.current?.focus();
    return () => opener?.focus();
  }, []);

  const close = () => {
    if (mode === "overlay") router.back();
    else router.push(closeHref, { scroll: false });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      return;
    }
    if (e.key !== "Tab" || !dialog.current) return;
    const items = [...dialog.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) return;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const { row } = evidence;
  const verdictKind =
    row.kind === "fail" ? "fail" : row.kind === "cant" ? "cant" : "pass";
  const facts: [string, React.ReactNode][] = [
    [
      "Claimed by",
      <span key="c" className="font-semibold text-ink">
        {evidence.claimedBy}
      </span>,
    ],
    ["Source", evidence.source],
    [
      "Retrieved",
      <span key="r" className="font-mono text-[13.5px]">
        {evidence.retrieved}
      </span>,
    ],
    [
      "Extractor",
      <span key="e" className="font-mono text-[13.5px]">
        {evidence.extractor}
      </span>,
    ],
    [
      "Extracted",
      <span key="x" className="break-all font-mono text-[13.5px] text-ink">
        {evidence.extracted}
      </span>,
    ],
  ];

  return (
    <div
      ref={dialog}
      role="dialog"
      aria-modal={mode === "overlay"}
      aria-labelledby="evidence-title"
      onKeyDown={onKeyDown}
      className={cn(
        "z-20 flex flex-col overflow-hidden rounded-card border border-graphite bg-paper-raised shadow-drawer",
        mode === "overlay"
          ? "fixed inset-x-3 top-[76px] bottom-3 sm:left-auto sm:w-[500px] xl:right-9 xl:bottom-[92px]"
          : "absolute inset-x-0 top-2 bottom-0 sm:left-auto sm:w-[500px] xl:right-3",
      )}
    >
      <div className="flex items-center gap-3 border-graphite border-b py-3.5 pr-3 pl-[22px]">
        <div className="flex flex-1 flex-col gap-0.5">
          <span className="font-bold text-meta text-muted uppercase tracking-label">
            Evidence
          </span>
          <h2
            id="evidence-title"
            className="font-serif font-semibold text-[22px] tracking-[-0.02em]"
          >
            {row.rule}
          </h2>
        </div>
        {mode === "overlay" ? (
          <button
            ref={closeButton}
            type="button"
            aria-label="Close evidence"
            onClick={close}
            className="flex size-10 items-center justify-center rounded-card border border-rule bg-paper-raised"
          >
            <CloseIcon />
          </button>
        ) : (
          <Link
            href={closeHref}
            scroll={false}
            aria-label="Close evidence"
            className="flex size-10 items-center justify-center rounded-card border border-rule bg-paper-raised text-graphite"
          >
            <CloseIcon />
          </Link>
        )}
      </div>
      <div className="flex flex-col gap-[18px] overflow-y-auto px-[22px] py-[18px]">
        <div
          className={cn(
            "flex items-center gap-2.5 rounded-card border px-3.5 py-3",
            verdictKind === "pass"
              ? "border-green-check"
              : verdictKind === "fail"
                ? "border-red-pen"
                : "border-graphite border-dashed",
          )}
        >
          <StatusIcon kind={verdictKind} size={20} />
          <span
            className={cn(
              "font-semibold text-[15px]",
              verdictKind === "pass"
                ? "text-green-check"
                : verdictKind === "fail"
                  ? "text-red-pen"
                  : "text-graphite",
            )}
          >
            {evidence.verdict}
          </span>
          <span className="flex-1 text-right font-mono text-[14px]">
            {evidence.comparison}
          </span>
        </div>

        {evidence.sourceText && (
          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-bold text-meta text-muted uppercase tracking-label">
                Source text
              </span>
              {evidence.subject && (
                <span className="truncate font-mono text-meta text-muted">
                  {evidence.subject}
                </span>
              )}
            </div>
            <blockquote className="rounded-sheet border border-rule bg-paper-sheet px-[18px] py-4 font-serif text-[15.5px] text-graphite-2 leading-[1.65]">
              <span className="mark-highlight">{evidence.sourceText}</span>
            </blockquote>
          </div>
        )}

        <dl className="flex flex-col overflow-hidden rounded-card border border-rule">
          {facts.map(([label, value], i) => (
            <div
              key={label}
              className={cn(
                "grid grid-cols-[120px_1fr] gap-3 px-3.5 py-2.5 text-[14px]",
                i < facts.length - 1 && "border-rule-soft border-b",
              )}
            >
              <dt className="text-muted">{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>

        {evidence.sourceText && (
          <div className="flex gap-3 rounded-card border border-pencil border-dashed bg-paper-shade px-4 py-3.5">
            <svg
              width="18"
              height="18"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              aria-hidden="true"
              className="mt-px shrink-0"
            >
              <rect x="2.5" y="1.5" width="11" height="13" rx="1.5" />
              <path d="M5 5h6M5 8h6M5 11h3.5" />
            </svg>
            <div className="flex flex-col gap-1">
              <span className="font-semibold text-[14px]">Untrusted text</span>
              <span className="text-[13.5px] text-graphite-2 leading-normal">
                Listing prose is treated as data, never as instructions. The
                proof engine reads only the extracted value above.
              </span>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-4 text-[14px]">
          {evidence.url && (
            <a
              href={evidence.url}
              target="_blank"
              rel="noreferrer"
              className="text-ink underline underline-offset-[3px]"
            >
              Open source page
            </a>
          )}
          {evidence.sourceId && (
            <span className="font-mono text-meta text-muted">
              source {evidence.sourceId}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function CloseIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M2 2l10 10M12 2L2 12" />
    </svg>
  );
}
