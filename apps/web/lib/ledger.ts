/*
 * The plan ledger's hash chain (SDD §12.3, supabase/migrations/0006_ledger.sql).
 * Each hash is sha256 over the UTF-8 bytes of
 *   prev_hash | seq | plan_id | actor | type | created_at | payload_text
 * joined with "|", where created_at is UTC ISO 8601 with microseconds and
 * payload_text is Postgres's canonical jsonb text. The first event chains
 * from 64 zeros. This module recomputes the same hashes, in the browser or
 * on the server, so "Verify chain" checks the stored values rather than
 * trusting them.
 */

export const GENESIS = "0".repeat(64);

export type LedgerRecord = {
  seq: number;
  planId: string;
  /** `user:…`, `system`, `worker:…` or `merchant:…`, as stored. */
  actor: string;
  type: string;
  /** UTC, microsecond precision: `2026-09-26T14:02:30.000000Z`. */
  createdAt: string;
  /** The payload exactly as Postgres prints jsonb, e.g. `{"max": 91000}`. */
  payloadText: string;
  prevHash: string;
  hash: string;
};

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function ledgerHash(
  e: Omit<LedgerRecord, "hash" | "prevHash">,
  prevHash: string,
): Promise<string> {
  return sha256Hex(
    [
      prevHash,
      String(e.seq),
      e.planId,
      e.actor,
      e.type,
      e.createdAt,
      e.payloadText,
    ].join("|"),
  );
}

/**
 * Postgres's jsonb text form for the flat, string/number/boolean payloads
 * the ledger stores: keys ordered by length then bytes, ": " and ", ".
 */
export function jsonbText(payload: Record<string, unknown>): string {
  const keys = Object.keys(payload).sort(
    (a, b) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0),
  );
  const value = (v: unknown): string => {
    if (v !== null && typeof v === "object") {
      if (Array.isArray(v)) return `[${v.map(value).join(", ")}]`;
      return jsonbText(v as Record<string, unknown>);
    }
    return JSON.stringify(v);
  };
  return `{${keys.map((k) => `${JSON.stringify(k)}: ${value(payload[k])}`).join(", ")}}`;
}

/** Appends events in order, computing seq, prev_hash and hash as the trigger does. */
export async function chain(
  planId: string,
  events: readonly {
    actor: string;
    type: string;
    createdAt: string;
    payload: Record<string, unknown>;
  }[],
): Promise<LedgerRecord[]> {
  const out: LedgerRecord[] = [];
  let prevHash = GENESIS;
  for (const [i, e] of events.entries()) {
    const base = {
      seq: i + 1,
      planId,
      actor: e.actor,
      type: e.type,
      createdAt: e.createdAt,
      payloadText: jsonbText(e.payload),
    };
    const hash = await ledgerHash(base, prevHash);
    out.push({ ...base, prevHash, hash });
    prevHash = hash;
  }
  return out;
}

export type ChainCheck =
  | { ok: true; entries: number }
  | {
      ok: false;
      entries: number;
      /** The first entry whose link or hash doesn't hold. */
      brokenSeq: number;
      reason: "sequence" | "link" | "hash";
    };

/** Recomputes every hash and link, stopping at the first break. */
export async function verifyChain(
  records: readonly LedgerRecord[],
): Promise<ChainCheck> {
  let prevHash = GENESIS;
  for (const [i, r] of records.entries()) {
    const fail = (reason: "sequence" | "link" | "hash"): ChainCheck => ({
      ok: false,
      entries: records.length,
      brokenSeq: r.seq,
      reason,
    });
    if (r.seq !== i + 1) return fail("sequence");
    if (r.prevHash !== prevHash) return fail("link");
    if ((await ledgerHash(r, r.prevHash)) !== r.hash) return fail("hash");
    prevHash = r.hash;
  }
  return { ok: true, entries: records.length };
}
