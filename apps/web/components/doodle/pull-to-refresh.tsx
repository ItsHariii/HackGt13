"use client";
import { useRouter } from "next/navigation";
import {
  type ReactNode,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { cn } from "@/lib/utils";
import { Figure } from "./figure";
import { usePrefersReducedMotion } from "./use-reduced-motion";

const ZONE = 112;
const TRIGGER = 80;

/**
 * Mobile pull to refresh on the plan page (SDD §17.9; Mobile Workspace
 * design): at the very top of the page, pulling down reveals the Scout on
 * a rope (pull1 → pull3 with distance); letting go past the line re-loads
 * the plan from the server. Touch listeners are passive and never cancel
 * scrolling; only active on touch screens narrower than the three-pane
 * layout. The browser's own pull-to-reload is turned off while mounted so
 * the two don't both fire. Reduced motion: no drag, the text only.
 */
export function PullToRefresh({
  children,
  className,
}: {
  children: ReactNode;
  /** Layout classes for the wrapper and its content (e.g. flex-1). */
  className?: string;
}) {
  const router = useRouter();
  const reduced = usePrefersReducedMotion();
  const [dist, setDist] = useState(0);
  const [pending, startTransition] = useTransition();
  const [refreshed, setRefreshed] = useState(false);
  const [dragging, setDragging] = useState(false);
  const start = useRef<number | null>(null);
  const current = useRef(0);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1279px) and (pointer: coarse)");
    if (!mq.matches) return;
    const html = document.documentElement;
    const before = html.style.overscrollBehaviorY;
    html.style.overscrollBehaviorY = "contain";
    const onStart = (e: TouchEvent) => {
      start.current =
        window.scrollY <= 0 ? (e.touches[0]?.clientY ?? null) : null;
      setDragging(start.current !== null);
    };
    const onMove = (e: TouchEvent) => {
      if (start.current === null) return;
      const dy = (e.touches[0]?.clientY ?? 0) - start.current;
      const d = dy > 0 && window.scrollY <= 0 ? Math.min(ZONE, dy * 0.5) : 0;
      current.current = d;
      if (!reduced) setDist(d);
    };
    const onEnd = () => {
      const pulled = current.current;
      start.current = null;
      current.current = 0;
      setDragging(false);
      setDist(0);
      if (pulled >= TRIGGER) {
        setRefreshed(false);
        startTransition(() => router.refresh());
        setRefreshed(true);
      }
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd, { passive: true });
    window.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      html.style.overscrollBehaviorY = before;
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, [reduced, router]);

  const shown = pending ? ZONE : dist;
  const pose =
    pending || shown >= TRIGGER
      ? "pull3"
      : shown >= TRIGGER / 2
        ? "pull2"
        : "pull1";
  return (
    <div className={cn("relative", className)}>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 flex h-[112px] items-end justify-center gap-3 pb-2 xl:hidden"
        style={{
          transform: `translateY(${shown - ZONE}px)`,
          opacity: shown > 0 ? 1 : 0,
          transition: dragging ? "none" : "transform 200ms, opacity 200ms",
        }}
      >
        <Figure who="scout" pose={reduced ? "pull2" : pose} h={96} />
        <span className="pb-6 text-muted text-small">
          {pending
            ? "Refreshing the plan…"
            : shown >= TRIGGER
              ? "Release to refresh"
              : "Pull to refresh"}
        </span>
      </div>
      <p aria-live="polite" className="sr-only">
        {pending ? "Refreshing the plan…" : refreshed ? "Plan refreshed." : ""}
      </p>
      <div
        className={className}
        style={{
          transform: shown ? `translateY(${shown}px)` : undefined,
          transition: dragging ? "none" : "transform 200ms",
        }}
      >
        {children}
      </div>
    </div>
  );
}
