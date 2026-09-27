"use client";
import { type ReactNode, useLayoutEffect, useRef, useState } from "react";
import { Figure } from "@/components/doodle/figure";
import { useFrames } from "@/components/doodle/use-frames";

/**
 * Search loading (SDD §17.9, Motion board 02): while sources are really
 * loading, the Scout runs along a lane above the source pills to the first
 * one still searching; when all have answered it sits. It never covers a
 * pill or its count. Moves by `transform`; the run cycle loops only while
 * `loading`. Reduced motion: a still Scout. The pills and the live region
 * beside them carry the meaning.
 */
export function SourceStrip({
  loading,
  waitingFor,
  children,
}: {
  loading: boolean;
  /** Key of the first source still searching (matches a child's `data-source`). */
  waitingFor: string | null;
  /** The source pills, each wrapped with `data-source`. */
  children: ReactNode;
}) {
  const row = useRef<HTMLDivElement>(null);
  const [x, setX] = useState(0);
  const pose = useFrames(["run1", "run2", "run3", "run4"], loading, {
    still: loading ? "run1" : "sit",
  });

  useLayoutEffect(() => {
    const el = row.current;
    if (!el) return;
    const place = () => {
      const target = waitingFor
        ? el.querySelector<HTMLElement>(
            `[data-source="${CSS.escape(waitingFor)}"]`,
          )
        : (el.lastElementChild as HTMLElement | null);
      if (!target) return setX(0);
      // Stand just before a waiting pill, or after the last one when done.
      setX(
        waitingFor
          ? Math.max(0, target.offsetLeft - 8)
          : target.offsetLeft + target.offsetWidth - 24,
      );
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [waitingFor]);

  return (
    <div className="relative flex flex-col">
      <div aria-hidden="true" className="h-11">
        <div
          className="w-fit transition-transform duration-500 ease-[cubic-bezier(.2,.7,.2,1)]"
          style={{ transform: `translateX(${x}px)` }}
        >
          <Figure who="scout" pose={pose} h={44} />
        </div>
      </div>
      <div ref={row} className="relative flex flex-wrap items-center gap-2">
        {children}
      </div>
    </div>
  );
}
