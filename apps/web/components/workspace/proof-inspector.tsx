"use client";
import { useProofStream } from "@/components/doodle/events";
import { Figure } from "@/components/doodle/figure";
import { useSequence } from "@/components/doodle/use-frames";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The Inspector beside the proof headline (SDD §17.9 "Proof streaming"):
 * it stamps once per `proof_result` broadcast (≈150 ms a row), then gives
 * a thumbs-up if nothing failed. Demo plans have no stream, so it stands
 * idle. The headline next to it is the text equivalent.
 */
export function ProofInspector({ planId }: { planId: string }) {
  const stream = useProofStream(UUID.test(planId) ? planId : null);
  const rest =
    stream.results.length > 0 && stream.fail === 0 ? "thumbs" : "idle";
  const pose = useSequence(
    ["stamp1", "stamp2", "stamp3", rest],
    stream.latest?.id ?? null,
    {
      ms: 50,
      rest: "idle",
    },
  );
  return <Figure who="inspector" pose={pose} h={56} className="-my-2" />;
}
