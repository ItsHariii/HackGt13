"use client";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Figure } from "./figure";
import { usePrefersReducedMotion } from "./use-reduced-motion";

const PULL = ["pull1", "pull2", "pull3"] as const;
/** How far the sheet starts above its place, px (Motion board 01). */
const TRAVEL = 120;

/**
 * Landing scroll (SDD §17.9, Motion board 01): the Scout hangs from a rope
 * and pulls the next sheet down into view. Progress is read from the scroll
 * position as the block enters the viewport, never written back (no scroll
 * hijacking). The sheet moves by `transform`; the rope stretches by
 * `scaleY`; the pose steps pull1 → pull3 with progress. Per frame, only a
 * CSS variable changes; React re-renders only when the pose changes.
 * Reduced motion: the sheet sits in place and the Scout holds pull2.
 * Decorative: the figure and rope are aria-hidden.
 */
export function PulledSheet({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();
  const [pose, setPose] = useState<(typeof PULL)[number]>("pull2");

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    if (reduced) {
      el.style.setProperty("--pull", "1");
      setPose("pull2");
      return;
    }
    let frame = 0;
    let visible = false;
    const update = () => {
      frame = 0;
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight;
      // 0 when the block's top reaches the bottom of the viewport, 1 once it
      // is 35% of the way up.
      const p = Math.min(1, Math.max(0, (vh - rect.top) / (vh * 0.65)));
      el.style.setProperty("--pull", p.toFixed(3));
      setPose(PULL[Math.min(2, Math.floor(p * 3))] ?? "pull3");
    };
    const onScroll = () => {
      if (visible && !frame) frame = requestAnimationFrame(update);
    };
    const io = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? false;
      if (visible) onScroll();
    });
    io.observe(el);
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      io.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [reduced]);

  const drop = `translateY(calc((1 - var(--pull)) * -${TRAVEL}px))`;
  return (
    <div ref={root} className="relative [--pull:1]">
      {/* The Scout rides with the sheet, outside the clip. Hidden on phones, where it would cover text. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-[90px] right-10 z-10 hidden md:block"
        style={{ transform: drop }}
      >
        {/* Rope above the Scout, stretched as the sheet comes down. */}
        <span
          className="absolute bottom-full left-1/2 h-[220px] w-[1.75px] origin-bottom bg-ink"
          style={{
            transform: "translateX(-50%) scaleY(calc(0.4 + var(--pull) * 0.6))",
          }}
        />
        <Figure who="scout" pose={pose} h={96} />
      </div>
      {/* The sheet slides down from behind this edge instead of over the text above. */}
      <div className="overflow-hidden">
        <div className="will-change-transform" style={{ transform: drop }}>
          {children}
        </div>
      </div>
    </div>
  );
}
