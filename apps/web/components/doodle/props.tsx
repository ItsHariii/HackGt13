import type { PropName } from "./skeleton";

/*
 * Props, drawn around the hand at (0, 0). "Upright" props are counter-
 * rotated by the figure so they stay level whatever the arm does; the rest
 * extend along the forearm (+y).
 */

export const UPRIGHT: ReadonlySet<PropName> = new Set([
  "magnifier",
  "clipboard",
  "stopSign",
  "map",
  "priceTag",
  "thumb",
]);

const LINE = "var(--fig-line)";
const FILL = "var(--fig-fill)";
const ACCENT = "var(--fig-accent)";
/** The Guard's sign bar is graphite in both themes (Character Sheet). */
const SIGN_BAR = "#2b2a28";

export function Prop({ name }: { name: PropName }) {
  switch (name) {
    case "magnifier":
      return (
        <g>
          <path d="M0 0 L4.5 -6" />
          <circle cx="7.5" cy="-10" r="4.5" fill={FILL} stroke={ACCENT} />
        </g>
      );
    case "clipboard":
      return (
        <g>
          <rect x="-6" y="-3" width="10" height="13" rx="1" fill={FILL} />
          <path d="M-3.5 -3.5 h5" />
          <path d="M-3.5 3.5 l2 2 l3.5 -4" stroke={ACCENT} />
        </g>
      );
    case "stamp":
      return (
        <g>
          <circle cx="0" cy="0" r="2" fill={FILL} />
          <path d="M0 2 V6" />
          <rect
            x="-5.5"
            y="6"
            width="11"
            height="4"
            rx="0.8"
            fill={ACCENT}
            stroke={ACCENT}
          />
        </g>
      );
    case "stopSign":
      return (
        <g>
          <path d="M0 5 V-12" stroke={SIGN_BAR} />
          <path
            d="M-4 -29 h8 l5.6 5.6 v8 l-5.6 5.6 h-8 l-5.6 -5.6 v-8 z"
            fill={ACCENT}
            stroke={LINE}
          />
          <rect
            x="-6"
            y="-21.2"
            width="12"
            height="2.6"
            fill={SIGN_BAR}
            stroke="none"
          />
        </g>
      );
    case "map":
      return (
        <g>
          <rect x="-10" y="-13" width="20" height="13" fill={FILL} />
          <path d="M-3.3 -13 v13 M3.3 -13 v13" strokeDasharray="1.5 1.5" />
          {/* The north arrow points down: the map is upside down. */}
          <path d="M6 -10 v5 m-1.6 -1.6 l1.6 1.6 l1.6 -1.6" stroke={ACCENT} />
        </g>
      );
    case "priceTag":
      return (
        <g>
          <path d="M0 0 L3 -3" />
          <path d="M3 -3 h9 v8 h-9 l-3 -4 z" fill={FILL} stroke={ACCENT} />
          <circle cx="4" cy="1" r="0.8" />
        </g>
      );
    case "pencil":
      return (
        <g>
          <path d="M0 -3 V9" stroke={ACCENT} strokeWidth={2.4} />
          <path d="M-1.2 9 L0 12 L1.2 9" />
        </g>
      );
    case "thumb":
      return (
        <g>
          <circle cx="0" cy="0" r="2.4" fill={FILL} />
          <path d="M0 -2.4 V-6.5" stroke={ACCENT} />
        </g>
      );
    case "rope":
    case "basket":
      return null;
  }
}

/** Props drawn in the figure's box: the rope it hangs from, a basket, a tangle. */
export function Scene({
  name,
  hipY,
}: {
  name: "ropeAbove" | "basketBelow" | "tangle";
  hipY: number;
}) {
  switch (name) {
    case "ropeAbove":
      return <path d={`M32 -24 V${hipY - 46}`} stroke={ACCENT} />;
    case "basketBelow":
      return (
        <g>
          <path d="M16 68 H48 L45 86 H19 Z" fill={FILL} />
          <path
            d="M18 74 H46 M19 80 H45"
            strokeDasharray="2 2"
            stroke={ACCENT}
          />
        </g>
      );
    case "tangle":
      return (
        <g stroke={ACCENT} fill="none">
          <ellipse
            cx="33"
            cy="46"
            rx="12"
            ry="4.5"
            transform="rotate(-18 33 46)"
          />
          <ellipse
            cx="31"
            cy="68"
            rx="10"
            ry="3.8"
            transform="rotate(14 31 68)"
          />
          <path d="M42 70 C52 76 50 88 58 92" />
          <rect x="56.5" y="90" width="5" height="4" rx="0.8" fill={ACCENT} />
        </g>
      );
  }
}
