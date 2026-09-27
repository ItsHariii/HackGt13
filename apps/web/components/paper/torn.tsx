import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

/*
 * Torn and pinned paper for the decorative surfaces (Landing v2, empty and
 * success states; Style Tile v2 "Pinned sheet"). Edges are a clip-path
 * polygon with a little jitter per step, seeded so the server and the
 * browser draw the same edge. Contract, checkout and receipt sheets stay
 * straight and flat; these are never used where money moves.
 */

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const px = (n: number) => `${Math.round(n * 100) / 100}px`;
const pct = (n: number) => `${Math.round(n * 100) / 100}%`;

export type Edges = {
  top?: boolean;
  right?: boolean;
  bottom?: boolean;
  left?: boolean;
};

/** A torn-edge polygon: up to `depth` px of tear on each torn edge. */
export function tornPath(
  seed: number,
  {
    depth = 9,
    edges = { top: true, right: true, bottom: true, left: true },
  }: {
    depth?: number | undefined;
    edges?: Edges | undefined;
  } = {},
): string {
  const r = rng(seed);
  // Tears cluster: a random walk, clamped to [0, depth].
  let v = r() * depth;
  const tear = (on: boolean | undefined) => {
    if (!on) return 0;
    v = Math.min(depth, Math.max(0, v + (r() - 0.45) * depth * 0.9));
    return v;
  };
  const pts: string[] = [];
  const nx = 60;
  const ny = 30;
  for (let i = 0; i <= nx; i++)
    pts.push(`${pct((i / nx) * 100)} ${px(tear(edges.top))}`);
  for (let i = 1; i <= ny; i++)
    pts.push(`calc(100% - ${px(tear(edges.right))}) ${pct((i / ny) * 100)}`);
  for (let i = nx - 1; i >= 0; i--)
    pts.push(`${pct((i / nx) * 100)} calc(100% - ${px(tear(edges.bottom))})`);
  for (let i = ny - 1; i >= 1; i--)
    pts.push(`${px(tear(edges.left))} ${pct((i / ny) * 100)}`);
  return `polygon(${pts.join(",")})`;
}

/** A receipt-style zig-zag bottom edge. */
export function zigzagPath(teeth = 30, depth = 8): string {
  const pts = ["0 0", "100% 0", "100% 100%"];
  for (let i = teeth * 2 - 1; i >= 0; i--) {
    const x = pct((i / (teeth * 2)) * 100);
    pts.push(i % 2 ? `${x} calc(100% - ${depth}px)` : `${x} 100%`);
  }
  return `polygon(${pts.join(",")})`;
}

const TONE = {
  paper: "bg-paper-raised",
  sheet: "bg-paper-sheet",
  kraft: "bg-[#efe4cc] dark:bg-paper-raised",
  sticky: "bg-[#faf0c8] dark:bg-paper-raised",
  lined:
    "bg-paper-sheet bg-[linear-gradient(90deg,transparent_44px,rgb(200_53_46/.4)_44px,rgb(200_53_46/.4)_45px,transparent_45px),repeating-linear-gradient(180deg,transparent_0,transparent_35px,rgb(31_58_147/.13)_35px,rgb(31_58_147/.13)_36px)]",
  ink: "bg-graphite text-paper-raised",
} as const;

/**
 * A sheet of paper with torn edges and a soft two-layer drop shadow (the
 * shadow sits on a wrapper, since clip-path would cut a box-shadow).
 */
export function TornSheet({
  seed,
  tone = "paper",
  rotate = 0,
  edges,
  depth,
  className,
  wrapperClassName,
  children,
  under,
  style,
}: {
  seed: number;
  tone?: keyof typeof TONE;
  /** Degrees; small values only (±1.6). */
  rotate?: number;
  edges?: Edges;
  depth?: number;
  className?: string;
  wrapperClassName?: string;
  children: ReactNode;
  /** Tape strips or a second sheet, drawn behind or over the paper. */
  under?: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div
      className={cn(
        "relative [filter:drop-shadow(0_1px_1px_rgb(43_42_40/.22))_drop-shadow(0_14px_18px_rgb(43_42_40/.2))]",
        wrapperClassName,
      )}
    >
      {under}
      <div
        className={cn("relative", TONE[tone], className)}
        style={{
          clipPath: tornPath(seed, { edges, depth }),
          transform: rotate ? `rotate(${rotate}deg)` : undefined,
          ...style,
        }}
      >
        {children}
      </div>
    </div>
  );
}

/** A strip of masking tape (or highlighter-yellow tape) pinning a sheet. */
export function Tape({
  className,
  rotate = -4,
  yellow = false,
}: {
  className?: string;
  rotate?: number;
  yellow?: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute z-[3] h-[28px] w-[110px] shadow-[inset_0_0_0_100px_rgb(255_255_255/.08)] [clip-path:polygon(3%_0,97%_6%,100%_50%,96%_100%,2%_94%,0_48%)]",
        yellow ? "bg-highlighter/60" : "bg-tape/90",
        className,
      )}
      style={{ transform: `rotate(${rotate}deg)` }}
    />
  );
}
