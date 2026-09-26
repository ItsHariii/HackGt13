"use client";
import { ShieldCheck } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { type ChainCheck, type LedgerRecord, verifyChain } from "@/lib/ledger";

/**
 * "Verify chain" (TASKS T11.10): recomputes every hash in this browser from
 * the entries shown, rather than trusting the stored values.
 */
export function VerifyChain({ records }: { records: LedgerRecord[] }) {
  const [result, setResult] = useState<ChainCheck | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        type="button"
        variant="outline"
        disabled={busy || records.length === 0}
        onClick={async () => {
          setBusy(true);
          setResult(await verifyChain(records));
          setBusy(false);
        }}
      >
        <ShieldCheck size={16} aria-hidden="true" />
        {busy ? "Verifying…" : "Verify chain"}
      </Button>
      <p
        role="status"
        className={
          result && !result.ok
            ? "font-semibold text-red-pen text-ui"
            : "font-semibold text-green-check text-ui"
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
