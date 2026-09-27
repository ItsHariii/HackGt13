"use client";
import { useRouter } from "next/navigation";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
} from "react";
import { useSolveStream } from "@/components/doodle/events";
import { Figure } from "@/components/doodle/figure";
import { ProofWalker } from "@/components/doodle/proof-walker";
import {
  allRevealed,
  type SolveRun,
  solveHeadline,
} from "@/lib/solve-progress";
import { cn } from "@/lib/utils";
import type { Tick } from "@/lib/workspace";
import { ProofRowBody, TICK } from "./proof-panel";

/** A rule as the live list shows it before its result lands. */
export type SolveRule = { id: string; text: string; hard: boolean };

type Solve = { start: () => void; running: boolean; error: string | null };

const SolveContext = createContext<Solve | null>(null);

/** The "Find plans" control inside a SolveStage. */
export function useSolve(): Solve {
  const solve = useContext(SolveContext);
  if (!solve) throw new Error("useSolve outside SolveStage");
  return solve;
}

/** How long the thumbs-up shows before the workspace opens. */
const SETTLE_MS = 600;

/**
 * A saved plan's "Find plans" (TASKS T11.3; Motion board 03). Shows
 * `children` (the not-solved card) until a solve starts, then the live proof
 * list: the server's steps as they happen, then Plan A's rows checked off
 * one at a time while the Inspector stamps each. Opens the workspace (or
 * Compare, when nothing fits) once the last row lands. `autoStart` runs it
 * once on arrival from the requirements page; `openPlan` picks the plan the
 * workspace opens on (Compare's "Use Plan B").
 */
export function SolveStage({
  planId,
  rules,
  autoStart = false,
  openPlan,
  children,
}: {
  planId: string;
  rules: SolveRule[];
  autoStart?: boolean;
  openPlan?: string | undefined;
  children: ReactNode;
}) {
  const router = useRouter();
  const { run, running, start } = useSolveStream(planId, openPlan);
  const started = useRef(false);
  useEffect(() => {
    if (!autoStart || started.current) return;
    started.current = true;
    start();
  }, [autoStart, start]);

  const settled =
    run.outcome === "infeasible" ||
    (run.outcome === "solved" && (run.proof === null || allRevealed(run)));
  useEffect(() => {
    if (!settled) return;
    // Open the plan whose rows were just shown (it may differ from the one asked for).
    const label = run.label ?? openPlan;
    const href =
      run.outcome === "infeasible"
        ? `/plans/${planId}/compare`
        : `/plans/${planId}${label && label !== "A" ? `?plan=${label}` : ""}`;
    const t = setTimeout(
      () => router.replace(href),
      run.outcome === "solved" && run.proof ? SETTLE_MS : 0,
    );
    return () => clearTimeout(t);
  }, [settled, run.outcome, run.proof, run.label, planId, openPlan, router]);

  const live = (running || run.outcome !== null) && run.error === null;
  return (
    <SolveContext value={{ start, running, error: run.error }}>
      {live ? <LiveProofList run={run} rules={rules} /> : children}
    </SolveContext>
  );
}

function LiveProofList({ run, rules }: { run: SolveRun; rules: SolveRule[] }) {
  const { proof, revealed } = run;
  const latest = proof && revealed > 0 ? proof.rows[revealed - 1] : undefined;
  const done = allRevealed(run);
  // Before Plan A is proved, one open tick per hard rule; then each hard row's own tick as it lands.
  const ticks: Tick[] = proof
    ? proof.rows
        .flatMap((r, i) => (r.hard ? [i] : []))
        .map((row, j) => (row < revealed ? (proof.ticks[j] ?? "open") : "open"))
    : rules.filter((r) => r.hard).map(() => "open");

  return (
    <section
      aria-labelledby="live-proof-heading"
      aria-busy={!done}
      className="relative flex min-h-0 flex-col rounded-card border border-rule bg-paper-raised shadow-stack-1"
    >
      <div className="flex flex-col gap-3 border-graphite border-b px-[22px] pt-[18px] pb-4">
        <div className="flex items-center justify-between">
          <h1
            id="live-proof-heading"
            className="font-bold text-meta uppercase tracking-label"
          >
            Proof
          </h1>
          <span className="flex items-center gap-2 text-meta text-muted">
            Deterministic engine · no AI
            {!latest && (
              <Figure who="inspector" pose="idle" h={56} className="-my-2" />
            )}
          </span>
        </div>
        <p
          aria-live="polite"
          className="font-serif font-semibold text-[24px] tracking-[-0.02em]"
        >
          {solveHeadline(run)}
        </p>
        <div
          aria-hidden="true"
          className="grid gap-[3px]"
          style={{
            gridTemplateColumns: `repeat(${Math.max(ticks.length, 1)}, minmax(0, 1fr))`,
          }}
        >
          {ticks.map((t, i) => (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: ticks are positional
              key={i}
              className={cn(
                "h-1.5 rounded-[1px] border transition-colors",
                TICK[t],
              )}
            />
          ))}
        </div>
        <p className="text-muted text-small">
          {done
            ? run.outcome === "solved"
              ? `Opening Plan ${run.label ?? "A"}…`
              : (proof?.sub ?? run.step)
            : (run.step ?? "Starting…")}
        </p>
      </div>
      <div className="relative flex min-h-0 flex-col overflow-y-auto pt-1">
        <span
          aria-hidden="true"
          className="absolute top-0 bottom-0 left-[30px] border-[#c9c1af] border-l-[1.5px] border-dashed dark:border-[#4a5f80]"
        />
        <ProofWalker
          requirementId={latest?.requirementId ?? null}
          eventId={latest?.id ?? null}
          done={done && !proof?.rows.some((r) => r.kind === "fail")}
        />
        <ol className="flex flex-col">
          {proof
            ? proof.rows.map((r, i) => (
                <Row
                  key={r.id}
                  requirementId={r.requirementId}
                  fail={i < revealed && r.kind === "fail"}
                >
                  {i < revealed ? (
                    <ProofRowBody row={r} />
                  ) : (
                    <Pending rule={r.rule} status="Checking…" />
                  )}
                </Row>
              ))
            : rules.map((r) => (
                <Row key={r.id} requirementId={r.id} fail={false}>
                  <Pending rule={r.text} status="Not checked yet" />
                </Row>
              ))}
        </ol>
      </div>
    </section>
  );
}

function Row({
  requirementId,
  fail,
  children,
}: {
  requirementId: string;
  fail: boolean;
  children: ReactNode;
}) {
  return (
    <li data-requirement-id={requirementId}>
      <div
        className={cn(
          "relative grid grid-cols-[22px_minmax(0,1fr)_auto] items-center gap-3 border-rule-soft border-b py-[13px] pr-[18px] pl-[60px] text-graphite",
          fail && "bg-red-pen-wash",
        )}
      >
        <span
          aria-hidden="true"
          className="absolute top-1/2 left-5 -mt-2.5 size-5 rounded-full bg-paper-raised"
        />
        {children}
      </div>
    </li>
  );
}

/** A row still waiting for its result: a dashed pencil ring, no verdict. */
function Pending({ rule, status }: { rule: string; status: string }) {
  return (
    <>
      <span
        aria-hidden="true"
        className="relative block size-[22px] rounded-full border-[1.5px] border-pencil border-dashed"
      />
      <span className="flex min-w-0 flex-col gap-[3px]">
        <span className="font-semibold text-[14.5px] text-muted leading-[1.3]">
          {rule}
        </span>
        <span className="font-semibold text-[12.5px] text-muted">{status}</span>
      </span>
      <span />
    </>
  );
}
