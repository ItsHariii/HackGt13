"use client";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { annotate } from "rough-notation";
import { cn } from "@/lib/utils";

export type MarkType = "circle" | "highlight" | "bracket";

/** The three editorial marks (SDD §17.7), nothing else is hand-drawn. */
const MARK: Record<
  MarkType,
  {
    fallback: string;
    color: string;
    alpha?: number | undefined;
    config: Parameters<typeof annotate>[1];
  }
> = {
  circle: {
    fallback: "mark-circle",
    color: "--color-red-pen",
    config: { type: "circle", padding: 6, strokeWidth: 2, iterations: 1 },
  },
  highlight: {
    fallback: "mark-highlight",
    color: "--color-highlighter",
    config: { type: "highlight", multiline: true, iterations: 1 },
  },
  bracket: {
    fallback: "mark-bracket",
    color: "--color-red-pen",
    config: {
      type: "bracket",
      brackets: ["right"],
      padding: [2, 10],
      strokeWidth: 2,
      iterations: 1,
    },
  },
};

const reducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * A red-pen circle (failing value), highlighter (quoted evidence) or
 * bracket (grouped diff changes). Server-rendered as the CSS mark, then
 * redrawn by rough-notation once mounted; with reduced motion the drawn
 * mark appears without animation. Marks are decoration: the meaning is
 * always also in the text next to them.
 */
export function Mark({
  type,
  children,
  show = true,
  className,
}: {
  type: MarkType;
  children: ReactNode;
  /** Draw the mark (lets callers time it to an event). */
  show?: boolean | undefined;
  className?: string | undefined;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || !show) return;
    const spec = MARK[type];
    const token = getComputedStyle(el).getPropertyValue(spec.color).trim();
    const color =
      type === "highlight"
        ? `color-mix(in srgb, ${token} 55%, transparent)`
        : token;
    const a = annotate(el, {
      ...spec.config,
      color,
      animate: !reducedMotion(),
      animationDuration: type === "circle" ? 500 : 400,
    });
    a.show();
    setDrawn(true);
    return () => {
      a.remove();
      setDrawn(false);
    };
  }, [type, show]);
  return (
    <span
      ref={ref}
      data-mark={type}
      className={cn(
        type === "circle" && "font-bold text-red-pen",
        show && !drawn && MARK[type].fallback,
        className,
      )}
    >
      {children}
    </span>
  );
}
