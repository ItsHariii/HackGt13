"use client";
import { ShieldCheck } from "lucide-react";
import { useState } from "react";
import { type ChainCheck, type LedgerRecord, verifyChain } from "@/lib/ledger";

/**
 * "Verify chain" (TASKS T11.10): recomputes every hash in this browser from
 * the entries shown, rather than trusting the stored values.
 */
export function VerifyChain({ records }: { records: LedgerRecord[] }) {
  const [result, setResult] = useState<ChainCheck | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        className="inline-flex h-12 items-center gap-2 rounded-card bg-graphite px-5 font-semibold text-[15px] text-paper-raised shadow-primary hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        disabled={busy || records.length === 0}
        onClick={async () => {
          setBusy(true);
          setResult(await verifyChain(records));
          setBusy(false);
        }}
      >
        <ShieldCheck size={16} aria-hidden="true" />
        {busy ? "Verifying…" : "Verify chain"}
      </button>
      <p
        role="status"
        className={
          result && !result.ok
            ? "font-semibold text-[14px] text-red-pen"
            : "font-semibold text-[14px] text-green-check"
        }
      >
        {result === null
          ? ""
          : result.ok
            ? `✓ Chain intact · ${result.entries} entries`
            : `✗ Chain broken at entry ${result.brokenSeq} (${result.reason === "hash" ? "hash doesn't match its contents" : result.reason === "link" ? "doesn't link to the entry before" : "sequence gap"})`}
      </p>
    </div>
  );
}
