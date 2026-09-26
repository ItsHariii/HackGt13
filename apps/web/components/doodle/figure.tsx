import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { HIGHFIVE, POSES, type Who } from "./poses";
import { Prop, Scene, UPRIGHT } from "./props";
import {
  BONE,
  clampHeight,
  HIP,
  type Limb,
  type Pose,
  type PropName,
  strokeFor,
} from "./skeleton";

const EASE = "cubic-bezier(.2,.7,.2,1)";

/** One accent per figure (SDD §17.8). */
const ACCENT: Record<Who, string> = {
  scout: "var(--color-ink)",
  inspector: "var(--color-green-check)",
  notary: "var(--color-red-pen)",
  guard: "var(--color-highlighter)",
  gremlin: "var(--color-tape)",
};

const DEFAULT_HANDS: Record<Who, { L?: PropName; R?: PropName }> = {
  scout: {},
  inspector: { L: "clipboard", R: "magnifier" },
  notary: { R: "stamp" },
  guard: { R: "stopSign" },
  gremlin: { R: "priceTag" },
};

export type FigureWho = Who | "pair";

/** The design's view boxes (Figure.dc.html). */
function viewBox(
  who: FigureWho,
  pose: string,
): [number, number, number, number] {
  if (who === "pair") return [0, 0, 140, 100];
  if (who === "guard") return [-12, 0, 88, 96];
  if (who === "scout" && pose.startsWith("pull")) return [0, -24, 64, 120];
  if (who === "scout" && pose === "sit") return [-4, 0, 72, 96];
  if (who === "scout" && pose === "tangled") return [0, 0, 66, 96];
  if (pose.startsWith("stamp")) return [0, -20, 64, 116];
  return [0, 0, 64, 96];
}

const t = (ms: number): CSSProperties["transition"] =>
  `transform ${ms}ms ${EASE}`;

/** A group rotated at its joint; CSS transitions the change between poses. */
function Joint({
  x = 0,
  y = 0,
  deg,
  ms,
  children,
}: {
  x?: number;
  y?: number;
  deg: number;
  ms: number;
  children: React.ReactNode;
}) {
  return (
    <g
      style={{
        transform: `translate(${x}px, ${y}px) rotate(${deg}deg)`,
        transition: t(ms),
      }}
    >
      {children}
    </g>
  );
}

function Leg({ limb, ms }: { limb: Limb; ms: number }) {
  return (
    <Joint deg={limb[0]} ms={ms}>
      <path d={`M0 0 V${BONE.thigh}`} />
      <Joint y={BONE.thigh} deg={limb[1]} ms={ms}>
        <path d={`M0 0 V${BONE.shin}`} />
      </Joint>
    </Joint>
  );
}

function Arm({
  limb,
  torso,
  prop,
  ms,
}: {
  limb: Limb;
  torso: number;
  prop: PropName | null | undefined;
  ms: number;
}) {
  const level = UPRIGHT.has(prop as PropName);
  return (
    <Joint deg={limb[0]} ms={ms}>
      <path d={`M0 0 V${BONE.upperArm}`} />
      <Joint y={BONE.upperArm} deg={limb[1]} ms={ms}>
        <path d={`M0 0 V${BONE.foreArm}`} />
        {prop && (
          <Joint
            y={BONE.foreArm}
            deg={level ? -(torso + limb[0] + limb[1]) : 0}
            ms={ms}
          >
            <Prop name={prop} />
          </Joint>
        )}
      </Joint>
    </Joint>
  );
}

/** One figure's body at a pose, inside its 64 × 96 box. */
function Body({ who, pose }: { who: Who; pose: Pose }) {
  const ms = pose.ms ?? 180;
  const [hx, hy] = pose.hip ?? HIP;
  const torso = pose.torso ?? 0;
  const hands = DEFAULT_HANDS[who];
  const handL = "handL" in pose ? pose.handL : hands.L;
  const handR = "handR" in pose ? pose.handR : hands.R;
  return (
    <g>
      {pose.scene && <Scene name={pose.scene} hipY={hy} />}
      <Joint x={hx} y={hy} deg={0} ms={ms}>
        <Leg limb={pose.legL} ms={ms} />
        <Leg limb={pose.legR} ms={ms} />
        <Joint deg={torso} ms={ms}>
          <path d={`M0 0 V${-BONE.torso}`} />
          {who === "scout" && (
            // Satchel: strap across the chest, bag at the hip.
            <g>
              <path d={`M-4 ${-BONE.torso + 2} L7 -4`} />
              <rect
                x="4.5"
                y="-5"
                width="8"
                height="6.5"
                rx="1"
                fill="var(--fig-fill)"
              />
              <path d="M4.5 -2.5 h8" stroke="var(--fig-accent)" />
            </g>
          )}
          <Joint y={-BONE.torso} deg={0} ms={ms}>
            {who === "notary" && (
              <path
                d="M-4 1 L0 3 L-4 5 Z M4 1 L0 3 L4 5 Z"
                fill="var(--fig-accent)"
                stroke="var(--fig-accent)"
              />
            )}
            {who === "scout" && (
              <g>
                <circle
                  cx="-2"
                  cy="6"
                  r="1.8"
                  fill="var(--fig-fill)"
                  stroke="var(--fig-accent)"
                />
                <circle
                  cx="2"
                  cy="6"
                  r="1.8"
                  fill="var(--fig-fill)"
                  stroke="var(--fig-accent)"
                />
              </g>
            )}
            <Arm limb={pose.armL} torso={torso} prop={handL} ms={ms} />
            <Arm limb={pose.armR} torso={torso} prop={handR} ms={ms} />
            <Joint y={-(BONE.neck + BONE.headR)} deg={pose.head ?? 0} ms={ms}>
              {who === "gremlin" && (
                <path
                  d="M-6 -3 L-10 -10 L-3 -6 M6 -3 L10 -10 L3 -6"
                  fill="var(--fig-fill)"
                />
              )}
              <circle r={BONE.headR} fill="var(--fig-fill)" />
              {(who === "scout" || who === "guard") && (
                <path
                  d="M-6.6 -2.4 A7 7 0 0 1 6.6 -2.4 Z M6.6 -2.4 H11"
                  fill={
                    who === "scout" ? "var(--fig-accent)" : "var(--fig-line)"
                  }
                />
              )}
              <circle
                cx="-2.4"
                cy="0.5"
                r="0.7"
                fill="var(--fig-line)"
                stroke="none"
              />
              <circle
                cx="2.4"
                cy="0.5"
                r="0.7"
                fill="var(--fig-line)"
                stroke="none"
              />
            </Joint>
          </Joint>
        </Joint>
      </Joint>
    </g>
  );
}

/**
 * A stick figure from the cast (SDD §17.8–17.9, TASKS T10B.1). Decorative:
 * always `aria-hidden`, so every screen that shows one also says the same
 * thing in text. Unknown poses fall back to `idle`.
 */
export function Figure({
  who,
  pose = "idle",
  h = 96,
  dark = false,
  flip = false,
  className,
}: {
  who: FigureWho;
  pose?: string;
  /** Height in px, 24–400. */
  h?: number;
  /** Force Blueprint colors (otherwise the surrounding theme decides). */
  dark?: boolean;
  flip?: boolean;
  className?: string;
}) {
  const height = clampHeight(h);
  const [x, y, w, vh] = viewBox(who, pose);
  const width = Math.round((height * w) / vh);
  const style = {
    "--fig-line": "var(--color-graphite)",
    "--fig-fill": "var(--color-paper-raised)",
    "--fig-accent": who === "pair" ? ACCENT.scout : ACCENT[who],
  } as CSSProperties;
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width={width}
      height={height}
      viewBox={`${x} ${y} ${w} ${vh}`}
      fill="none"
      stroke="var(--fig-line)"
      strokeWidth={strokeFor(height)}
      strokeLinecap="round"
      strokeLinejoin="round"
      data-figure={who}
      data-pose={pose}
      className={cn(
        "shrink-0 overflow-visible [&_*]:[vector-effect:non-scaling-stroke]",
        dark && "blueprint",
        className,
      )}
      style={style}
    >
      <g
        style={
          flip
            ? { transform: `scale(-1, 1)`, transformOrigin: `${x + w / 2}px 0` }
            : undefined
        }
      >
        {who === "pair" ? (
          <>
            <g
              transform="translate(18 4)"
              style={{ "--fig-accent": ACCENT.scout } as CSSProperties}
            >
              <Body who="scout" pose={HIGHFIVE.scout} />
            </g>
            <g
              transform="translate(58 4)"
              style={{ "--fig-accent": ACCENT.inspector } as CSSProperties}
            >
              <Body
                who="inspector"
                pose={{ ...HIGHFIVE.inspector, handL: null }}
              />
            </g>
          </>
        ) : (
          <Body who={who} pose={POSES[who][pose] ?? POSES[who].idle} />
        )}
      </g>
    </svg>
  );
}
