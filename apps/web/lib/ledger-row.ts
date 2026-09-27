import { jsonbText, type LedgerRecord } from "./ledger";

export type LedgerRow = {
  seq: number;
  plan_id: string;
  actor: string;
  type: string;
  created_at: string;
  payload: unknown;
  prev_hash: string;
  hash: string;
};

/** A stored row as the hash sees it: UTC microseconds and jsonb's text form. */
export function ledgerRecord(e: LedgerRow): LedgerRecord {
  return {
    seq: e.seq,
    planId: e.plan_id,
    actor: e.actor,
    type: e.type,
    // PostgREST returns ISO with an offset; the hash uses UTC microseconds.
    createdAt: `${new Date(e.created_at).toISOString().slice(0, 19)}.${(e.created_at.match(/\.(\d+)/)?.[1] ?? "0").padEnd(6, "0").slice(0, 6)}Z`,
    payloadText: jsonbText(e.payload as Record<string, unknown>),
    prevHash: e.prev_hash,
    hash: e.hash,
  };
}
