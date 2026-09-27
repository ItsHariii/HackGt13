"use client";
import { useEffect, useState } from "react";
import { Figure } from "./figure";
import { usePrefersReducedMotion } from "./use-reduced-motion";

/**
 * Purchase paused (SDD §17.9, Motion board 05): the Guard walks 46 px in
 * beside Pay with the stop sign up. Pay must already be disabled (the block
 * is the event; this is only its picture), so nothing waits on it. Stands
 * next to Pay, never on it. A CSS animation on a server-rendered figure:
 * it shows without JS, and reduced motion gets it already in place.
 */
export function GuardStepIn({ h = 112 }: { h?: number }) {
  return (
    <div aria-hidden="true" className="guard-step-in shrink-0">
      <Figure who="guard" pose="block" h={h} />
    </div>
  );
}

/**
 * Paid (Motion board 06): the Scout and the Inspector high-five once the
 * receipt has printed (`delay`, ≈1.1 s). Mount it only for an authorized
 * payment. Reduced motion: the high-five is already there.
 */
export function HighFive({
  h = 120,
  delay = 1100,
}: {
  h?: number;
  delay?: number;
}) {
  const reduced = usePrefersReducedMotion();
  const [five, setFive] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setFive(true), delay);
    return () => clearTimeout(t);
  }, [delay]);
  return (
    <div aria-hidden="true">
      <Figure who="pair" pose={five || reduced ? "highfive" : "ready"} h={h} />
    </div>
  );
}
