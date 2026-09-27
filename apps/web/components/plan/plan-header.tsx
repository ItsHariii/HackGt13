import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Wordmark } from "@/components/brand/wordmark";
import { ThemeToggle } from "@/components/theme-toggle";
import { StatusIcon } from "@/components/workspace/status-icon";
import { cn } from "@/lib/utils";

const STEPS = ["Brief", "Rules", "Plans", "Contract"] as const;

/**
 * Chrome for the screens inside a plan (Contract, Purchase Paused,
 * Checkout, Ledger designs): the stamp logo, a back link, and either the
 * Brief · Rules · Plans · Contract stepper or a right-hand slot.
 */
export function PlanHeader({
  back,
  step,
  right,
  demo = false,
  title,
  tall = false,
}: {
  back?: { href: string; label: string } | undefined;
  /** 1-based index into Brief · Rules · Plans · Contract. */
  step?: number | undefined;
  right?: ReactNode;
  /** Shows that the plan is the flagship demo, served from fixtures. */
  demo?: boolean | undefined;
  /** The plan's name beside the logo (Requirements design). */
  title?: string | undefined;
  /** The 84 px flow header (Brief and Requirements); 64 px otherwise. */
  tall?: boolean | undefined;
}) {
  return (
    <header
      className={cn(
        "flex shrink-0 flex-wrap items-center gap-x-5 gap-y-2 border-graphite border-b-[3px] border-double bg-paper px-4 py-2 text-graphite",
        tall ? "min-h-[84px] gap-x-10 sm:px-12" : "min-h-16 sm:px-7",
      )}
    >
      <Wordmark
        className={tall ? "text-[24px]" : "text-[22px]"}
        size={tall ? 31 : 29}
      />
      {title && <span className="text-[15px] text-muted">{title}</span>}
      {back && <span aria-hidden="true" className="h-6 w-px bg-rule" />}
      {back && (
        <Link
          href={back.href}
          className="inline-flex min-h-6 items-center gap-1.5 text-small underline-offset-4 hover:underline"
        >
          <ArrowLeft size={14} aria-hidden="true" />
          {back.label}
        </Link>
      )}
      {demo && <DemoNote />}
      <div className="flex-1" />
      {step !== undefined && <Stepper current={step} />}
      {right}
      <ThemeToggle />
    </header>
  );
}

/** Pages served from the flagship fixtures say so, once, in the header. */
export function DemoNote({ label = "Demo plan" }: { label?: string }) {
  return (
    <span
      title="Demo data from the test fixtures, checked by the real proof engine."
      className="inline-flex h-6 items-center rounded-[4px] border border-pencil border-dashed px-1.5 font-semibold text-meta text-muted"
    >
      {label}
    </span>
  );
}

function Stepper({ current }: { current: number }) {
  return (
    <nav aria-label="Plan progress" className="hidden lg:block">
      <ol className="flex items-center gap-2 text-small">
        {STEPS.map((s, i) => {
          const n = i + 1;
          return (
            <li key={s} className="flex items-center gap-2">
              {i > 0 && (
                <span
                  aria-hidden="true"
                  className={
                    n <= current
                      ? "w-5 border-graphite border-t"
                      : "w-5 border-pencil border-t border-dashed"
                  }
                />
              )}
              {n < current ? (
                <span className="flex items-center gap-1.5 font-semibold text-green-check">
                  <StatusIcon kind="done" size={14} />
                  {s}
                  <span className="sr-only">(done)</span>
                </span>
              ) : n === current ? (
                <span
                  aria-current="step"
                  className="flex h-7 items-center gap-1.5 rounded-pill border border-graphite bg-paper-raised px-2.5 font-semibold"
                >
                  <span className="font-mono">{n}</span>
                  {s}
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-muted">
                  <span className="font-mono">{n}</span>
                  {s}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
