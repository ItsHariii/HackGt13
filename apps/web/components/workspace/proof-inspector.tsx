"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { useProofStream } from "@/components/doodle/events";
import { Figure } from "@/components/doodle/figure";
import { ProofWalker } from "@/components/doodle/proof-walker";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const planStream = (planId: string) => (UUID.test(planId) ? planId : null);

/**
 * The Inspector by the proof headline, standing idle until results stream
 * in; then it steps down into the list (ProofRows). Demo plans have no
 * stream, so it stays here.
 */
export function ProofInspector({ planId }: { planId: string }) {
  const stream = useProofStream(planStream(planId));
  if (stream.results.length > 0) return null;
  return <Figure who="inspector" pose="idle" h={56} className="-my-2" />;
}

/** The walking Inspector inside the proof list (Motion board 03). */
export function ProofListInspector({
  planId,
  hardRules,
}: {
  planId: string;
  hardRules: number;
}) {
  const stream = useProofStream(planStream(planId));
  return (
    <ProofWalker
      requirementId={stream.latest?.requirementId ?? null}
      eventId={stream.latest?.id ?? null}
      done={stream.results.length >= hardRules && stream.fail === 0}
    />
  );
}

/**
 * Proof results streaming in over Realtime (TASKS T11.3): a live count while
 * a new report's rows arrive (a re-solve, a refinement, another tab), then
 * the page refreshes to render that report. Demo plans have no stream.
 */
export function LiveProof({ planId }: { planId: string }) {
  const stream = useProofStream(planStream(planId));
  const router = useRouter();
  const seen = useRef<string | null>(null);
  const reportId = stream.latest?.reportId ?? null;
  const count = stream.results.length;
  useEffect(() => {
    if (!reportId || count === 0) return;
    // Rows of one report arrive together; refresh once they settle.
    const t = setTimeout(() => {
      if (seen.current === `${reportId}:${count}`) return;
      seen.current = `${reportId}:${count}`;
      router.refresh();
    }, 700);
    return () => clearTimeout(t);
  }, [reportId, count, router]);
  if (count === 0) return null;
  return (
    <p role="status" className="text-muted text-small">
      New proof: {count} results · {stream.pass} pass · {stream.fail} fail ·{" "}
      {stream.unknown} can't check
    </p>
  );
}
