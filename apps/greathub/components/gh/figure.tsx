/*
 * GreatHub's cast, ported from the GHFigure design: Captain Inkwell (the
 * mascot) and the Gull (Chaos Deck only). `GHDefs` renders the shared
 * parts once per page; each pose references them with <use>. Figures are
 * decoration: they never sit on prices, specs, hashes or results, and the
 * Captain never appears next to a failure state (T6B.8).
 */

const NAVY = "#0B1B2B";
const INK = "#3B5F8F";
const CARD = "#FFFDF8";

const LEG_PATHS = [
  "M92 162 C 72 195, 62 225, 42 236 C 30 240, 28 226, 40 226",
  "M108 168 C 102 205, 92 238, 76 252 C 68 258, 60 250, 68 246",
  "M124 170 C 122 210, 120 238, 112 256",
  "M138 170 C 140 210, 142 238, 150 256",
  "M152 168 C 158 205, 168 238, 184 252 C 192 258, 200 250, 192 246",
  "M168 162 C 188 195, 198 225, 218 236 C 230 240, 232 226, 220 226",
];

const GULL_LEGS = [
  "M106 206 L 104 250 M 92 252 L 104 250 L 116 254",
  "M134 206 L 138 250 M 126 252 L 138 250 L 150 254",
];

/** An arm or tentacle: a navy outline with an ink core. */
function Limb({
  d,
  outer = 20,
  inner = 11,
}: {
  d: string;
  outer?: number;
  inner?: number;
}) {
  return (
    <g fill="none" strokeLinecap="round">
      <path d={d} stroke={NAVY} strokeWidth={outer} />
      <path d={d} stroke={INK} strokeWidth={inner} />
    </g>
  );
}

function Hand({
  x,
  y,
  rx = 17,
  ry = 21,
}: {
  x: number;
  y: number;
  rx?: number;
  ry?: number;
}) {
  return (
    <>
      <ellipse
        cx={x}
        cy={y}
        rx={rx}
        ry={ry}
        fill={INK}
        stroke={NAVY}
        strokeWidth="5"
      />
      <use href="#gh-tat" transform={`translate(${x} ${y + 1})`} />
    </>
  );
}

function Hip({ side }: { side: "L" | "R" }) {
  const d =
    side === "L"
      ? "M88 138 C 55 135, 38 160, 52 182 C 60 194, 78 188, 84 176"
      : "M172 138 C 205 135, 222 160, 208 182 C 200 194, 182 188, 176 176";
  return (
    <g>
      <Limb d={d} />
      <Hand x={side === "L" ? 46 : 214} y={160} />
    </g>
  );
}

export function GHDefs() {
  return (
    <svg width="0" height="0" className="gh-defs" aria-hidden="true">
      <defs>
        <g id="gh-legs" fill="none" strokeLinecap="round">
          <g stroke={NAVY} strokeWidth="20">
            {LEG_PATHS.map((d) => (
              <path key={d} d={d} />
            ))}
          </g>
          <g stroke={INK} strokeWidth="11">
            {LEG_PATHS.map((d) => (
              <path key={d} d={d} />
            ))}
          </g>
        </g>
        <g
          id="gh-head"
          stroke={NAVY}
          strokeWidth="5"
          strokeLinejoin="round"
          strokeLinecap="round"
        >
          <path
            d="M72 140 C 64 84, 196 84, 188 140 C 186 172, 74 172, 72 140 Z"
            fill={INK}
          />
          <path
            d="M92 110 C 100 100, 112 97, 120 98"
            fill="none"
            stroke="#6F8FBA"
            strokeWidth="4"
          />
          <g transform="rotate(-10 130 92)">
            <path d="M96 100 Q 100 64 131 62 Q 163 64 166 100 Z" fill={CARD} />
            <ellipse cx="131" cy="101" rx="44" ry="9" fill={CARD} />
            <path d="M104 90 Q 131 96 158 90" fill="none" strokeWidth="3" />
          </g>
          <path d="M150 150 L 172 152" fill="none" strokeWidth="4" />
          <rect x="170" y="128" width="15" height="24" rx="3" fill="#D9A94E" />
          <path
            d="M174 134h7M174 140h7M174 146h7"
            stroke="#7A5A1F"
            strokeWidth="2"
          />
        </g>
        <g
          id="gh-tat"
          fill="none"
          stroke="#F4ECDD"
          strokeWidth="2.4"
          strokeLinecap="round"
        >
          <circle cx="0" cy="-10" r="2.4" />
          <path d="M0 -7.6V8M-5 -3H5M-7 3Q0 11 7 3" />
        </g>
        <g id="gh-eyes">
          <path
            d="M98 125 q10 -7 20 0"
            fill="none"
            stroke={NAVY}
            strokeWidth="5"
            strokeLinecap="round"
          />
          <ellipse
            cx="148"
            cy="121"
            rx="11"
            ry="14"
            fill={CARD}
            stroke={NAVY}
            strokeWidth="4"
          />
          <ellipse cx="150" cy="124" rx="5.5" ry="8" fill={NAVY} />
          <path d="M150 124 L 155 118 L 156 124 Z" fill={CARD} />
        </g>
        <g id="gh-wink">
          <path
            d="M96 118 q12 12 24 0"
            fill="none"
            stroke={NAVY}
            strokeWidth="5"
            strokeLinecap="round"
          />
          <path
            d="M100 125 l-4 6M108 128 v7M116 125 l4 6"
            stroke={NAVY}
            strokeWidth="3"
            strokeLinecap="round"
          />
          <ellipse
            cx="148"
            cy="119"
            rx="12"
            ry="16"
            fill={CARD}
            stroke={NAVY}
            strokeWidth="4"
          />
          <ellipse cx="150" cy="122" rx="6" ry="9" fill={NAVY} />
          <path d="M150 122 L 156 115 L 157 122 Z" fill={CARD} />
          <path
            d="M106 142 Q 128 170 152 144 Z"
            fill="#7A2A1F"
            stroke={NAVY}
            strokeWidth="5"
            strokeLinejoin="round"
          />
        </g>
        <g id="gh-can" stroke={NAVY} strokeWidth="5" strokeLinejoin="round">
          <rect x="-18" y="-25" width="36" height="50" rx="4" fill="#1E7A4E" />
          <rect x="-18" y="-29" width="36" height="8" rx="3" fill="#B8893A" />
          <rect x="-18" y="21" width="36" height="7" rx="3" fill="#B8893A" />
          <text
            x="0"
            y="6"
            textAnchor="middle"
            fontFamily="var(--font-display), sans-serif"
            fontWeight="900"
            fontSize="13"
            fill="#FFFFFF"
            stroke="none"
          >
            KELP
          </text>
        </g>
        <g
          id="gh-gull"
          stroke={NAVY}
          strokeWidth="5"
          strokeLinejoin="round"
          strokeLinecap="round"
        >
          <path
            d="M68 158 L 34 146 L 46 168 L 32 186 L 72 180 Z"
            fill="#FFFFFF"
          />
          <ellipse cx="118" cy="165" rx="58" ry="45" fill="#FFFFFF" />
          <path
            d="M150 80 L 154 62 L 162 78 L 170 58 L 176 78 L 190 66 L 184 88"
            fill="#FFFFFF"
          />
          <circle cx="165" cy="110" r="32" fill="#FFFFFF" />
          <path
            d="M140 132 Q 166 148 192 128 L 188 142 Q 166 158 142 146 Z"
            fill="#D2452F"
          />
          <path d="M150 146 L 142 164 L 158 156 Z" fill="#D2452F" />
          <path d="M193 106 L 234 116 L 193 124 Z" fill="#E8B23A" />
          <path d="M195 116 H 222" fill="none" strokeWidth="3" />
        </g>
        <g
          id="gh-glegs"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {GULL_LEGS.map((d) => (
            <g key={d}>
              <path d={d} stroke={NAVY} strokeWidth="9" />
              <path d={d} stroke="#E07B39" strokeWidth="4" />
            </g>
          ))}
        </g>
        <g id="gh-gwing">
          <path
            d="M90 145 Q 125 135 150 165 Q 120 195 80 180 Q 70 160 90 145 Z"
            fill="#B9BDC2"
            stroke={NAVY}
            strokeWidth="5"
            strokeLinejoin="round"
          />
          <path
            d="M92 160 Q 110 158 124 170M88 172 Q 104 172 116 182"
            fill="none"
            stroke={NAVY}
            strokeWidth="3"
            strokeLinecap="round"
          />
        </g>
      </defs>
    </svg>
  );
}

export type GHPose =
  | "neutral"
  | "lean"
  | "point"
  | "net"
  | "spyglass"
  | "nap"
  | "gtag"
  | "gtangled";

const LABEL: Record<GHPose, string> = {
  neutral: "Captain Inkwell",
  lean: "Captain Inkwell winking, holding a can of Kelp",
  point: "Captain Inkwell pointing",
  net: "Captain Inkwell holding an empty cargo net",
  spyglass: "Captain Inkwell looking through a spyglass",
  nap: "Captain Inkwell napping in a hammock",
  gtag: "The Gull holding a stolen price tag",
  gtangled: "The Gull tangled in rope",
};

const SMILE = (
  <path
    d="M110 146 Q 130 158 150 148"
    fill="none"
    stroke={NAVY}
    strokeWidth="5"
    strokeLinecap="round"
  />
);

function Pose({
  pose,
  tag,
  flip,
}: {
  pose: GHPose;
  tag: string;
  flip: boolean;
}) {
  switch (pose) {
    case "neutral":
      return (
        <>
          <use href="#gh-legs" />
          <Hip side="L" />
          <Hip side="R" />
          <use href="#gh-head" />
          <use href="#gh-eyes" />
          {SMILE}
        </>
      );
    case "lean":
      return (
        <g transform="rotate(-6 130 262)">
          <use href="#gh-legs" />
          <Hip side="L" />
          <Limb d="M172 138 C 206 136, 222 116, 212 92" />
          <Hand x={216} y={122} />
          <use href="#gh-can" transform="translate(206 62) rotate(8)" />
          <use href="#gh-head" />
          <use href="#gh-wink" />
        </g>
      );
    case "point":
      return (
        <>
          <use href="#gh-legs" />
          <Hip side="L" />
          <Limb d="M172 140 C 206 142, 230 150, 246 166 C 252 172, 258 168, 256 162" />
          <Hand x={212} y={146} />
          <use href="#gh-head" />
          <path
            d="M98 125 q10 -7 20 0"
            fill="none"
            stroke={NAVY}
            strokeWidth="5"
            strokeLinecap="round"
          />
          <ellipse
            cx="148"
            cy="121"
            rx="11"
            ry="14"
            fill={CARD}
            stroke={NAVY}
            strokeWidth="4"
          />
          <ellipse cx="153" cy="124" rx="5.5" ry="8" fill={NAVY} />
          <path d="M153 124 L 158 118 L 159 124 Z" fill={CARD} />
          {SMILE}
        </>
      );
    case "net":
      return (
        <>
          <use href="#gh-legs" />
          <Hip side="L" />
          <path
            d="M196 62 L 252 62 L 244 132 Q 224 152 204 132 Z"
            fill="#FBF6EC"
            stroke={NAVY}
            strokeWidth="4"
            strokeLinejoin="round"
          />
          <path
            d="M206 62 L 228 142M220 62 L 240 124M234 62 L 246 94M248 62 L 212 140M234 62 L 204 120M220 62 L 200 90M198 84 L 250 84M200 106 L 247 106M202 126 L 245 126"
            stroke="#7A5A1F"
            strokeWidth="2"
          />
          <path
            d="M194 62 H 254"
            stroke={NAVY}
            strokeWidth="7"
            strokeLinecap="round"
          />
          <path
            d="M194 62 H 254"
            stroke="#C9A36B"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <Limb d="M172 138 C 205 130, 222 100, 214 64" />
          <Hand x={216} y={106} />
          <use href="#gh-head" />
          <path
            d="M98 125 q10 -7 20 0"
            fill="none"
            stroke={NAVY}
            strokeWidth="5"
            strokeLinecap="round"
          />
          <ellipse
            cx="148"
            cy="121"
            rx="11"
            ry="14"
            fill={CARD}
            stroke={NAVY}
            strokeWidth="4"
          />
          <ellipse cx="152" cy="118" rx="5.5" ry="8" fill={NAVY} />
          <path
            d="M138 102 Q 148 96 160 102"
            fill="none"
            stroke={NAVY}
            strokeWidth="4"
            strokeLinecap="round"
          />
          <path
            d="M112 152 Q 130 142 148 152"
            fill="none"
            stroke={NAVY}
            strokeWidth="5"
            strokeLinecap="round"
          />
        </>
      );
    case "spyglass":
      return (
        <>
          <use href="#gh-legs" />
          <Hip side="L" />
          <use href="#gh-head" />
          <path
            d="M96 124 q12 -2 24 0"
            fill="none"
            stroke={NAVY}
            strokeWidth="5"
            strokeLinecap="round"
          />
          <path
            d="M112 150 q 12 5 24 0"
            fill="none"
            stroke={NAVY}
            strokeWidth="5"
            strokeLinecap="round"
          />
          <g
            transform="rotate(-10 150 120)"
            stroke={NAVY}
            strokeWidth="4.5"
            strokeLinejoin="round"
          >
            <rect
              x="140"
              y="112"
              width="30"
              height="18"
              rx="3"
              fill="#7A5A1F"
            />
            <rect
              x="168"
              y="109"
              width="40"
              height="24"
              rx="3"
              fill="#B8893A"
            />
            <rect
              x="206"
              y="104"
              width="34"
              height="34"
              rx="4"
              fill="#D9A94E"
            />
            <path d="M186 109 v24M222 104 v34" strokeWidth="3" />
          </g>
          <Limb d="M176 150 C 200 156, 212 146, 206 128" />
          <Hand x={204} y={152} rx={16} ry={19} />
        </>
      );
    case "nap":
      return (
        <>
          <path
            d="M14 70 V 270M246 70 V 270"
            stroke={NAVY}
            strokeWidth="12"
            strokeLinecap="round"
          />
          <path
            d="M14 70 V 270M246 70 V 270"
            stroke="#9A7340"
            strokeWidth="6"
            strokeLinecap="round"
          />
          <path
            d="M16 96 L 44 158M244 96 L 216 158"
            stroke={NAVY}
            strokeWidth="3"
          />
          <g transform="translate(-8 44) rotate(-22 130 130) scale(.86)">
            <use href="#gh-head" />
            <path
              d="M96 124 q12 8 24 0M136 124 q12 8 24 0"
              fill="none"
              stroke={NAVY}
              strokeWidth="5"
              strokeLinecap="round"
            />
            <path
              d="M112 148 q10 6 22 0"
              fill="none"
              stroke={NAVY}
              strokeWidth="4"
              strokeLinecap="round"
            />
          </g>
          <path
            d="M40 156 Q 130 250 220 156 Q 130 214 40 156 Z"
            fill="#C9A36B"
            stroke={NAVY}
            strokeWidth="5"
            strokeLinejoin="round"
          />
          <path
            d="M70 176 Q 130 216 190 176M90 194 Q 130 214 170 194M100 170 L 110 216M130 180 V 226M160 170 L 150 216"
            fill="none"
            stroke="#7A5A1F"
            strokeWidth="2"
          />
          <Limb
            d="M168 186 C 180 210, 176 232, 190 246 C 196 252, 204 246, 198 240"
            outer={18}
            inner={9}
          />
          <Limb d="M186 176 C 204 196, 206 214, 222 222" outer={18} inner={9} />
          <text
            x="170"
            y="60"
            fontFamily="var(--font-display), sans-serif"
            fontWeight="800"
            fontSize="22"
            fill={NAVY}
          >
            z
          </text>
          <text
            x="188"
            y="40"
            fontFamily="var(--font-display), sans-serif"
            fontWeight="800"
            fontSize="30"
            fill={NAVY}
          >
            Z
          </text>
        </>
      );
    case "gtag":
      return (
        <>
          <use href="#gh-glegs" />
          <use href="#gh-gull" />
          <use href="#gh-gwing" />
          <ellipse
            cx="175"
            cy="104"
            rx="8"
            ry="10"
            fill="#FFFFFF"
            stroke={NAVY}
            strokeWidth="4"
          />
          <ellipse cx="178" cy="107" rx="4" ry="5" fill={NAVY} />
          <path
            d="M166 100 Q 175 96 184 100 L 184 104 L 166 104 Z"
            fill="#FFFFFF"
            stroke={NAVY}
            strokeWidth="3"
            strokeLinejoin="round"
          />
          <path
            d="M163 92 L 185 90"
            stroke={NAVY}
            strokeWidth="5"
            strokeLinecap="round"
          />
          <path d="M222 118 L 214 142" stroke={NAVY} strokeWidth="2.5" />
          <g transform="rotate(10 210 160)">
            <path
              d="M170 142 H 254 V 178 H 170 L 158 160 Z"
              fill={CARD}
              stroke={NAVY}
              strokeWidth="4"
              strokeLinejoin="round"
            />
            <circle
              cx="169"
              cy="160"
              r="3.5"
              fill="none"
              stroke="#7A5A1F"
              strokeWidth="2.5"
            />
            <text
              x="215"
              y="165"
              textAnchor="middle"
              fontFamily="var(--font-code), ui-monospace, monospace"
              fontWeight="600"
              fontSize="13"
              fill={NAVY}
              // A flipped Gull still shows a readable price.
              transform={flip ? "translate(430 0) scale(-1 1)" : undefined}
            >
              {tag}
            </text>
          </g>
        </>
      );
    case "gtangled":
      return (
        <>
          <use href="#gh-glegs" />
          <use href="#gh-gull" />
          <use href="#gh-gwing" />
          <circle
            cx="176"
            cy="104"
            r="11"
            fill="#FFFFFF"
            stroke={NAVY}
            strokeWidth="4"
          />
          <circle cx="176" cy="106" r="3.5" fill={NAVY} />
          <path
            d="M162 88 Q 172 82 186 90"
            fill="none"
            stroke={NAVY}
            strokeWidth="4"
            strokeLinecap="round"
          />
          <path
            d="M204 84 q-5 9 0 13 q5 -4 0 -13 Z"
            fill="#FFFFFF"
            stroke={NAVY}
            strokeWidth="2.5"
          />
          <g fill="none" strokeLinecap="round" strokeLinejoin="round">
            {[
              "M52 146 C 90 116, 170 214, 196 146",
              "M64 192 C 110 158, 160 234, 186 186",
              "M92 234 C 116 214, 146 256, 162 234",
              "M196 146 C 222 126, 232 180, 252 156",
              "M52 146 C 30 160, 40 210, 64 192",
            ].map((d) => (
              <g key={d}>
                <path d={d} stroke={NAVY} strokeWidth="11" />
                <path d={d} stroke="#C9A36B" strokeWidth="5" />
              </g>
            ))}
          </g>
        </>
      );
  }
}

export function GHFigure({
  pose,
  tag = "$329.00",
  flip = false,
  className,
  decorative = true,
}: {
  pose: GHPose;
  /** The Gull's price tag always shows the real, exact value. */
  tag?: string;
  flip?: boolean;
  className?: string;
  /** Figures are decoration unless the page has no other text for them. */
  decorative?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 260 280"
      className={className}
      style={{
        overflow: "visible",
        transform: flip ? "scaleX(-1)" : undefined,
      }}
      aria-hidden={decorative ? true : undefined}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : LABEL[pose]}
    >
      <Pose pose={pose} tag={tag} flip={flip} />
    </svg>
  );
}
