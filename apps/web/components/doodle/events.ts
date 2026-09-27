"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  addProofResult,
  applySearchChunk,
  type ConsentDiffEvent,
  EMPTY_PROOF,
  type LedgerEvent,
  type PlanEvents,
  type ProofStream,
  type SourceState,
  splitLines,
  startSearch,
} from "@/lib/figure-events";
import { subscribePlan } from "@/lib/plan-channel";
import {
  allRevealed,
  applySolveLine,
  IDLE_SOLVE,
  revealAll,
  revealNext,
  SOLVE_MESSAGE,
  type SolveErrorCode,
  type SolveLine,
  type SolveRun,
} from "@/lib/solve-progress";
import { usePrefersReducedMotion } from "./use-reduced-motion";

/*
 * Event hooks (TASKS T10B.5). Figures animate only from these: each one
 * reflects a real broadcast or request, never a timer pretending to work.
 * Pass `null` as the plan id to stay idle (e.g. demo data).
 */

function usePlanEvent<E extends keyof PlanEvents>(
  planId: string | null,
  event: E,
  onEvent: (payload: PlanEvents[E]) => void,
) {
  const handler = useRef(onEvent);
  handler.current = onEvent;
  useEffect(() => {
    if (!planId) return;
    return subscribePlan(planId, event, (p) => handler.current(p));
  }, [planId, event]);
}

/** Proof results as they are written: counts and the latest row. */
export function useProofStream(planId: string | null): ProofStream {
  const [stream, setStream] = useState(EMPTY_PROOF);
  usePlanEvent(planId, "proof_result", (r) =>
    setStream((s) => addProofResult(s, r)),
  );
  return stream;
}

/** The latest ledger entry of one type (null until one arrives). */
export function useLedgerEvent(
  planId: string | null,
  type: string,
): LedgerEvent | null {
  const [latest, setLatest] = useState<LedgerEvent | null>(null);
  usePlanEvent(planId, "ledger_event", (e) => {
    if (e.type === type) setLatest(e);
  });
  return latest;
}

/** A server-verified signature (the Notary stamps only after this). */
export const useSignatureEvent = (planId: string | null) =>
  useLedgerEvent(planId, "contract.signed");

/** An authorized payment (receipt prints, high-five). */
export const usePaymentEvent = (planId: string | null) =>
  useLedgerEvent(planId, "payment.authorized");

/** A change accepted under the autonomy policy (Inspector's thumbs-up). */
export const useAutoAcceptedEvent = (planId: string | null) =>
  useLedgerEvent(planId, "change.auto_accepted");

/** The latest consent diff; `classification: "block"` brings the Guard. */
export function useDiffEvent(planId: string | null): ConsentDiffEvent | null {
  const [latest, setLatest] = useState<ConsentDiffEvent | null>(null);
  usePlanEvent(planId, "consent_diff", setLatest);
  return latest;
}

/**
 * Per-source search state from the NDJSON stream of GET /api/search.
 * `sources` are the sources expected to answer; each starts "searching".
 */
export function useSearchStatus(
  query: string | null,
  sources: readonly string[],
  /** Bump to search again (Retry). */
  attempt = 0,
): {
  sources: SourceState[];
  loading: boolean;
  products: unknown[];
  facets: unknown[];
} {
  const [states, setStates] = useState<SourceState[]>([]);
  const [products, setProducts] = useState<unknown[]>([]);
  const [facets, setFacets] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(false);
  const expected = sources.join("\u0000");
  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` only re-runs the search (Retry)
  useEffect(() => {
    if (!query) return;
    const abort = new AbortController();
    setStates(startSearch(expected ? expected.split("\u0000") : []));
    setProducts([]);
    setFacets([]);
    setLoading(true);
    (async () => {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`, {
        signal: abort.signal,
      });
      if (!res.ok || !res.body) throw new Error(`search ${res.status}`);
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        const { lines, rest } = splitLines(buffer + value);
        buffer = rest;
        for (const line of lines) {
          const chunk = JSON.parse(line);
          setStates((s) => applySearchChunk(s, chunk));
          setProducts((p) => [...p, ...(chunk.products ?? [])]);
          setFacets((f) => [...f, ...(chunk.facets ?? [])]);
        }
      }
    })()
      .catch(() => {
        if (!abort.signal.aborted)
          setStates((s) =>
            s.map((x) =>
              x.state === "searching" ? { ...x, state: "error" } : x,
            ),
          );
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => abort.abort();
  }, [query, expected, attempt]);
  return { sources: states, loading, products, facets };
}

/** Motion board 03: one stamped proof row every ≈150 ms. */
const ROW_MS = 150;

/**
 * "Find plans" as it runs: the NDJSON steps of POST /api/plans/[id]/solve,
 * then Plan A's proof rows revealed one at a time (all at once with reduced
 * motion). `start` begins a solve (or retries one). Leaving the page doesn't
 * cancel it: the server finishes and stores the plans either way.
 */
export function useSolveStream(
  planId: string,
  /** The plan whose proof rows stream (else the first). */
  focus?: string,
): {
  run: SolveRun;
  running: boolean;
  start: () => void;
} {
  const [run, setRun] = useState(IDLE_SOLVE);
  const [running, setRunning] = useState(false);
  const reduced = usePrefersReducedMotion();
  const start = useCallback(() => {
    setRun(IDLE_SOLVE);
    setRunning(true);
    const apply = (line: SolveLine) => setRun((r) => applySolveLine(r, line));
    (async () => {
      const query = focus ? `?plan=${encodeURIComponent(focus)}` : "";
      const res = await fetch(`/api/plans/${planId}/solve${query}`, {
        method: "POST",
        headers: { Accept: "application/x-ndjson" },
      });
      if (!res.ok || !res.body) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
          retryAfterMs?: number;
        };
        const code = (
          body.error && body.error in SOLVE_MESSAGE ? body.error : "storage"
        ) as SolveErrorCode;
        apply({
          phase: "error",
          code,
          ...(body.retryAfterMs ? { retryAfterMs: body.retryAfterMs } : {}),
        });
        return;
      }
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      let ended = false;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        const { lines, rest } = splitLines(buffer + value);
        buffer = rest;
        for (const line of lines) {
          const parsed = JSON.parse(line) as SolveLine;
          ended ||= parsed.phase === "done" || parsed.phase === "error";
          apply(parsed);
        }
      }
      if (!ended) apply({ phase: "error", code: "storage" });
    })()
      .catch(() => apply({ phase: "error", code: "storage" }))
      .finally(() => setRunning(false));
  }, [planId, focus]);

  // Rows queue and land one per tick, however fast they arrived.
  const queued = run.proof !== null && !allRevealed(run);
  useEffect(() => {
    if (!queued) return;
    if (reduced) {
      setRun(revealAll);
      return;
    }
    const id = setInterval(() => setRun(revealNext), ROW_MS);
    return () => clearInterval(id);
  }, [queued, reduced]);
  return { run, running, start };
}

export type BenchCase = { id: string; category: string; caught: boolean };

/**
 * ProofBench progress: cases arrive one at a time from `run` (the bench
 * runner's stream); the Gremlin tries, the Guard blocks, the counter ticks.
 */
export function useBenchProgress(run: () => AsyncIterable<BenchCase>) {
  const [cases, setCases] = useState<BenchCase[]>([]);
  const [running, setRunning] = useState(false);
  const source = useRef(run);
  source.current = run;
  const start = useCallback(async () => {
    setCases([]);
    setRunning(true);
    try {
      for await (const c of source.current()) setCases((cs) => [...cs, c]);
    } finally {
      setRunning(false);
    }
  }, []);
  const caught = cases.filter((c) => c.caught).length;
  return {
    start,
    running,
    cases,
    caught,
    latest: cases[cases.length - 1] ?? null,
  };
}
