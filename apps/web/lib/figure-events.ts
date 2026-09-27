import type { SearchChunk, SearchStatus } from "@cartel/catalog";

/*
 * Pure state for the event hooks (TASKS T10B.5). Payload shapes are the
 * Realtime broadcasts in supabase/migrations/0009_realtime.sql and the
 * NDJSON lines of GET /api/search.
 */

export type ProofResultEvent = {
  id: string;
  reportId: string;
  /** The requirement key (the engine's requirementId), as proof rows carry it. */
  requirementId: string;
  scope: string;
  verdict: "pass" | "fail" | "unknown";
  state: string;
  reason: string | null;
};

export type ConsentDiffEvent = {
  id: string;
  contractVersionId: string;
  classification: "identical" | "auto" | "reapprove" | "block";
  currentTotalMinor: number;
  changeCount: number;
};

export type LedgerEvent = {
  seq: number;
  type: string;
  actor: string;
  hash: string;
  createdAt: string;
};

export type ContractStatusEvent = {
  contractVersionId: string;
  version: number;
  from: string | null;
  to: string;
};

export type PlanEvents = {
  proof_result: ProofResultEvent;
  consent_diff: ConsentDiffEvent;
  ledger_event: LedgerEvent;
  contract_status: ContractStatusEvent;
};

export type ProofStream = {
  results: ProofResultEvent[];
  pass: number;
  fail: number;
  unknown: number;
  /** The most recent result, for the Inspector's stamp. */
  latest: ProofResultEvent | null;
};

export const EMPTY_PROOF: ProofStream = {
  results: [],
  pass: 0,
  fail: 0,
  unknown: 0,
  latest: null,
};

/** Adds one broadcast result; a new report starts a fresh stream; duplicates are ignored. */
export function addProofResult(
  s: ProofStream,
  r: ProofResultEvent,
): ProofStream {
  const base = s.latest && s.latest.reportId !== r.reportId ? EMPTY_PROOF : s;
  if (base.results.some((x) => x.id === r.id)) return base;
  return {
    results: [...base.results, r],
    pass: base.pass + (r.verdict === "pass" ? 1 : 0),
    fail: base.fail + (r.verdict === "fail" ? 1 : 0),
    unknown: base.unknown + (r.verdict === "unknown" ? 1 : 0),
    latest: r,
  };
}

/** The summary the proof panel announces (only the summary, SDD §17.9). */
export function proofAnnouncement(s: ProofStream, total?: number): string {
  const checked = s.results.length;
  if (checked === 0) return "";
  if (total && checked < total) return `${checked} of ${total} checked…`;
  if (s.fail > 0) return `${s.fail} of ${checked} hard rules fail.`;
  return `${s.pass} of ${checked} hard rules pass.`;
}

export type SourceState = {
  source: string;
  state: "searching" | "done" | "error";
  status?: SearchStatus;
  count: number;
};

export function startSearch(sources: readonly string[]): SourceState[] {
  return sources.map((source) => ({ source, state: "searching", count: 0 }));
}

/** Applies one NDJSON chunk. Zero results is a pass, not an error. */
export function applySearchChunk(
  states: SourceState[],
  chunk: Pick<SearchChunk, "source" | "status" | "products">,
): SourceState[] {
  const failed = !(chunk.status === "ok" || chunk.status === "cached");
  const next: SourceState = {
    source: chunk.source,
    state: failed ? "error" : "done",
    status: chunk.status,
    count: chunk.products.length,
  };
  const i = states.findIndex((s) => s.source === chunk.source);
  if (i < 0) return [...states, next];
  return states.map((s, j) => (j === i ? next : s));
}

/** "Shopify Catalog: 42 results." / "All sources done: 48 results." */
export function searchAnnouncement(states: SourceState[]): string {
  if (states.length === 0) return "";
  const waiting = states.filter((s) => s.state === "searching");
  const total = states.reduce((n, s) => n + s.count, 0);
  if (waiting.length === 0) return `All sources done: ${total} results.`;
  return `Searching ${waiting.map((s) => s.source).join(", ")}…`;
}

/** Splits a streamed NDJSON body into complete lines, keeping the remainder. */
export function splitLines(buffer: string): { lines: string[]; rest: string } {
  const parts = buffer.split("\n");
  const rest = parts.pop() ?? "";
  return { lines: parts.filter((l) => l.trim().length > 0), rest };
}
