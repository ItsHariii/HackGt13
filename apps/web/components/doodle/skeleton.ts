/*
 * The stick-figure skeleton (SDD §17.9, TASKS T10B.1). A pose is joint
 * angles, not drawings: the figure is nested SVG groups, each rotated at
 * its joint, so moving between poses changes only `transform` and CSS
 * transitions interpolate it (no animation library, nothing per frame in
 * JS).
 *
 * Angles are degrees, clockwise on screen, 0 = hanging straight down from
 * the parent joint (the torso: 0 = upright). Screen-left limbs are `L`.
 * A limb is [upper, lower]: the upper segment relative to its parent, the
 * lower relative to the upper.
 */

export type Limb = readonly [upper: number, lower: number];

export type PropName =
  | "magnifier"
  | "clipboard"
  | "stamp"
  | "stopSign"
  | "rope"
  | "basket"
  | "map"
  | "priceTag"
  | "pencil"
  | "thumb";

export type Pose = {
  /** Hip position in the figure's own 64 × 96 box. */
  hip?: readonly [x: number, y: number];
  torso?: number;
  /** Head tilt relative to the torso. */
  head?: number;
  armL: Limb;
  armR: Limb;
  legL: Limb;
  legR: Limb;
  /** Props held in each hand (replace the figure's defaults). */
  handL?: PropName | null;
  handR?: PropName | null;
  /** A prop drawn in the figure's box rather than a hand (rope, basket). */
  scene?: "ropeAbove" | "basketBelow" | "tangle" | null;
  /** Transition length into this pose, ms (default 180). */
  ms?: number;
};

/** Segment lengths in the 64 × 96 box. */
export const BONE = {
  torso: 24,
  neck: 2,
  headR: 7,
  upperArm: 13,
  foreArm: 12,
  thigh: 17,
  shin: 16,
} as const;

export const HIP: readonly [number, number] = [32, 60];

/** Stroke width in screen px for a figure `h` px tall (Figure.dc.html). */
export function strokeFor(h: number): number {
  return h >= 90 ? 2 : h >= 60 ? 1.75 : 1.5;
}

export const clampHeight = (h: number) => Math.min(400, Math.max(24, h));
