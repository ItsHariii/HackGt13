"use client";
import { useEffect, useRef, useState } from "react";
import { usePrefersReducedMotion } from "./use-reduced-motion";

/**
 * Steps through pose frames (e.g. run1–run4) while `active` is true, which
 * callers tie to a real loading state; stops on the first frame when it
 * ends. With reduced motion it holds `still` (SDD §17.9 rule 4).
 */
export function useFrames(
  frames: readonly string[],
  active: boolean,
  {
    ms = 90,
    still = frames[0] ?? "idle",
  }: { ms?: number; still?: string } = {},
): string {
  const reduced = usePrefersReducedMotion();
  const [i, setI] = useState(0);
  useEffect(() => {
    if (!active || reduced || frames.length < 2) {
      setI(0);
      return;
    }
    const id = setInterval(() => setI((n) => (n + 1) % frames.length), ms);
    return () => clearInterval(id);
  }, [active, reduced, frames.length, ms]);
  if (reduced || !active) return still;
  return frames[i] ?? still;
}

/**
 * Plays a one-shot sequence (e.g. stamp1 → stamp2 → stamp3) each time
 * `trigger` changes to a new non-null value, then rests on `rest`.
 * Reduced motion jumps straight to the last frame.
 */
export function useSequence(
  frames: readonly string[],
  trigger: unknown,
  {
    ms = 150,
    rest = frames[frames.length - 1] ?? "idle",
  }: { ms?: number; rest?: string } = {},
): string {
  const reduced = usePrefersReducedMotion();
  const [pose, setPose] = useState(rest);
  // Frames are read when the event fires, not tracked: only a new event replays.
  const spec = useRef({ frames, ms, rest });
  spec.current = { frames, ms, rest };
  useEffect(() => {
    if (trigger === null || trigger === undefined) return;
    const { frames: f, ms: step, rest: r } = spec.current;
    if (reduced) {
      setPose(f[f.length - 1] ?? r);
      return;
    }
    const timers = f.map((name, i) =>
      setTimeout(() => setPose(name), i * step),
    );
    return () => {
      for (const id of timers) clearTimeout(id);
    };
  }, [trigger, reduced]);
  return pose;
}
