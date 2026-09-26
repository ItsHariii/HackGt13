"use client";
import { useLayoutEffect, useRef, useState } from "react";
import { Figure } from "./figure";
import { useSequence } from "./use-frames";

/**
 * Proof streaming (SDD §17.9, Motion board 03): the Inspector walks down
 * the proof list to the row whose result just arrived and stamps it
 * (≈150 ms a row). It stands in the list's left gutter, never on a result.
 * Render it inside the positioned, scrolling list; rows carry
 * `data-requirement-id`. Moves by `transform` only. Hidden until the first
 * result arrives; the headline beside the list is the text equivalent.
 */
export function ProofWalker({
  requirementId,
  eventId,
  done,
}: {
  /** The requirement of the latest result, or null before the first. */
  requirementId: string | null;
  /** Changes on every result, so each one gets a stamp. */
  eventId: string | null;
  /** Every result is in and none failed: rest with a thumbs-up. */
  done: boolean;
}) {
  const self = useRef<HTMLDivElement>(null);
  const [y, setY] = useState<number | null>(null);
  const pose = useSequence(
    ["stamp1", "stamp2", "stamp3", done ? "thumbs" : "idle"],
    eventId,
    { ms: 50, rest: "idle" },
  );

  useLayoutEffect(() => {
    const list = self.current?.parentElement;
    if (!list || !requirementId) return;
    const row = list.querySelector<HTMLElement>(
      `[data-requirement-id="${CSS.escape(requirementId)}"]`,
    );
    if (row) setY(row.offsetTop + row.offsetHeight / 2);
  }, [requirementId]);

  return (
    <div
      ref={self}
      aria-hidden="true"
      className="pointer-events-none absolute top-0 left-0 z-10 transition-[transform,opacity] duration-300 ease-[cubic-bezier(.2,.7,.2,1)]"
      style={{
        transform: `translateY(${(y ?? 0) - 22}px)`,
        opacity: y === null ? 0 : 1,
      }}
    >
      <Figure who="inspector" pose={pose} h={40} />
    </div>
  );
}
