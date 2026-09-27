import Link from "next/link";
import type { ReactNode } from "react";
import { Figure } from "@/components/doodle/figure";
import { cn } from "@/lib/utils";

/*
 * The Edge States design (TASKS T11.14, SDD §17.4): every screen's empty,
 * error and degraded states say what happened and what to do next. Figures
 * are decoration; the text carries the meaning.
 */

export function StateCard({
  figure,
  eyebrow,
  title,
  children,
  actions,
  tone = "plain",
  className,
  headingLevel: H = "h2",
}: {
  figure?: ReactNode;
  eyebrow?: string | undefined;
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
  tone?: "plain" | "fail" | "dashed";
  className?: string | undefined;
  headingLevel?: "h1" | "h2" | "h3" | undefined;
}) {
  return (
    <section
      className={cn(
        "flex flex-col items-start gap-3 rounded-card border bg-paper-raised p-6 text-graphite sm:flex-row sm:items-center sm:gap-5",
        tone === "plain" && "border-rule shadow-stack-1",
        tone === "fail" && "border-red-pen",
        tone === "dashed" && "border-pencil border-dashed",
        className,
      )}
    >
      {figure && (
        <div aria-hidden="true" className="shrink-0">
          {figure}
        </div>
      )}
      <div className="flex flex-col gap-3">
        {eyebrow && (
          <p className="font-mono text-[12px] text-muted uppercase">
            {eyebrow}
          </p>
        )}
        <H className="font-semibold font-serif text-[24px] leading-[1.2] tracking-[-0.02em]">
          {title}
        </H>
        {children && (
          <div className="text-[15px] text-graphite-2 leading-[1.45]">
            {children}
          </div>
        )}
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </section>
  );
}

const action =
  "inline-flex min-h-11 items-center rounded-card border border-graphite bg-paper-raised px-4 font-semibold text-ui text-graphite hover:bg-paper";
export const primary =
  "inline-flex min-h-11 items-center rounded-card bg-graphite px-4 font-semibold text-paper-raised text-ui shadow-primary";

/** 1 · Empty plan: the Scout sits on the basket. */
export function EmptyPlan({
  headingLevel,
}: {
  headingLevel?: "h1" | "h2" | "h3" | undefined;
}) {
  return (
    <StateCard
      figure={<Figure who="scout" pose="sit" h={88} />}
      eyebrow="Empty plan"
      title="No items yet."
      headingLevel={headingLevel}
      actions={
        <>
          <Link href="/search" className={primary}>
            Search
          </Link>
          <Link href="/explore#kits" className={action}>
            Start from a kit
          </Link>
        </>
      }
    >
      Search, or start from a kit.
    </StateCard>
  );
}

/** 3 · Source error: one source didn't answer; the rest are fine. */
export function SourceError({
  source,
  onRetry,
}: {
  source: string;
  onRetry?: (() => void) | undefined;
}) {
  return (
    <StateCard
      tone="fail"
      figure={<Figure who="scout" pose="tangled" h={72} />}
      eyebrow="Source error"
      title={`${source} · no response`}
      headingLevel="h3"
      actions={
        onRetry && (
          <button type="button" onClick={onRetry} className={action}>
            Retry
          </button>
        )
      }
    >
      {source} didn't answer. Other sources are fine.
    </StateCard>
  );
}

/** 8 · AI off: the manual path still works end to end. */
export function AiOff({ href }: { href: string }) {
  return (
    <StateCard
      tone="dashed"
      eyebrow="AI unavailable"
      title="AI is unavailable. You can still add rules by hand."
      headingLevel="h2"
      actions={
        <a href={href} className={action}>
          Add a rule by hand
        </a>
      }
    >
      Proof, signing and payment work the same.
    </StateCard>
  );
}

/** 6 · Passkey cancelled: nothing was signed. */
export function PasskeyCancelled({
  version,
  onRetry,
}: {
  version: number;
  onRetry: () => void;
}) {
  return (
    <StateCard
      tone="fail"
      eyebrow="Signing cancelled"
      title="Nothing was signed."
      headingLevel="h3"
      actions={
        <button type="button" onClick={onRetry} className={action}>
          Try again
        </button>
      }
    >
      Contract v{version} is unchanged and still unsigned.
    </StateCard>
  );
}

/** A stored plan with rules but no solved basket yet. */
export function NotSolvedYet({
  planId,
  title,
  ruleCount,
  stale = false,
  solve,
}: {
  planId: string;
  title: string;
  ruleCount: number;
  /** The rules changed since the last solve. */
  stale?: boolean;
  /** The "Find plans" control, when the plan can be solved. */
  solve?: ReactNode;
}) {
  return (
    <StateCard
      figure={<Figure who="inspector" pose="idle" h={88} />}
      eyebrow={title}
      title={
        ruleCount === 0
          ? "No rules yet."
          : stale
            ? "Your rules changed. Find plans again."
            : `${ruleCount} rules saved. No plans yet.`
      }
      headingLevel="h1"
      actions={
        <>
          {solve}
          <Link
            href={`/plans/${planId}/requirements`}
            className={solve ? action : primary}
          >
            {ruleCount === 0 ? "Add rules" : "Edit rules"}
          </Link>
          <Link href="/search" className={action}>
            Search products
          </Link>
        </>
      }
    >
      {ruleCount === 0
        ? "Add the rules this plan must meet, by hand or from your brief."
        : "Find plans checks GreatHub's catalog against every rule, prices each basket through GreatHub's own checkout, and proves it. Nothing is bought."}
    </StateCard>
  );
}
