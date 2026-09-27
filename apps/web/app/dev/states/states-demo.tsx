"use client";
import { useState } from "react";
import { PasskeyCancelled, SourceError } from "@/components/states/edge-states";

/** The interactive edge states: Retry and Try again do something visible. */
export function StatesDemo() {
  const [retries, setRetries] = useState(0);
  const [tries, setTries] = useState(0);
  return (
    <>
      <SourceError
        source="UPCitemdb"
        onRetry={() => setRetries((n) => n + 1)}
      />
      <p role="status" className="text-muted text-small">
        {retries ? `Retried ${retries} time${retries === 1 ? "" : "s"}.` : ""}
      </p>
      <PasskeyCancelled version={7} onRetry={() => setTries((n) => n + 1)} />
      <p role="status" className="text-muted text-small">
        {tries ? `Signing would start again (${tries}).` : ""}
      </p>
    </>
  );
}
