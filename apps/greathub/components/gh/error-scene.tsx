import { GHFigure } from "./figure";

/** The art beside the 404 and 500 pages (GreatHub Errors design). */
export function ErrorScene({ kind }: { kind: "404" | "500" }) {
  return (
    <div className="gh-error-art" aria-hidden="true">
      {kind === "404" ? (
        <>
          <svg viewBox="0 0 620 560" className="gh-error-bg" aria-hidden="true">
            <path
              d="M0 400 Q 40 384 80 400 T 160 400 T 240 400 T 320 400 T 400 400 T 480 400 T 560 400 T 640 400 V 560 H 0 Z"
              fill="#D6F0E0"
              stroke="#0B1B2B"
              strokeWidth="4"
            />
            <path
              d="M40 450 q20 -10 40 0M200 470 q20 -10 40 0M420 440 q20 -10 40 0M520 490 q20 -10 40 0M300 510 q20 -10 40 0"
              fill="none"
              stroke="#3A9D6A"
              strokeWidth="3"
              strokeLinecap="round"
            />
            <g transform="translate(470 378) rotate(-24)">
              <rect
                x="-30"
                y="-12"
                width="54"
                height="24"
                rx="10"
                fill="#A8DDBE"
                stroke="#0B1B2B"
                strokeWidth="4"
              />
              <rect
                x="22"
                y="-7"
                width="16"
                height="14"
                rx="3"
                fill="#A8DDBE"
                stroke="#0B1B2B"
                strokeWidth="4"
              />
              <rect
                x="36"
                y="-6"
                width="9"
                height="12"
                rx="2"
                fill="#B8893A"
                stroke="#0B1B2B"
                strokeWidth="3"
              />
              <rect
                x="-18"
                y="-6"
                width="28"
                height="12"
                rx="2"
                fill="#FFFDF8"
                stroke="#0B1B2B"
                strokeWidth="2"
              />
            </g>
            <path
              d="M0 330 H 620"
              stroke="#C9A36B"
              strokeWidth="2"
              strokeDasharray="2 10"
              strokeLinecap="round"
            />
          </svg>
          <GHFigure pose="spyglass" className="gh-error-figure f404" />
        </>
      ) : (
        <>
          <svg viewBox="0 0 620 560" className="gh-error-bg" aria-hidden="true">
            <path
              d="M40 470 H 580"
              stroke="#0B1B2B"
              strokeWidth="4"
              strokeLinecap="round"
            />
            <rect
              x="80"
              y="470"
              width="30"
              height="80"
              fill="#9A7340"
              stroke="#0B1B2B"
              strokeWidth="4"
            />
            <rect
              x="510"
              y="470"
              width="30"
              height="80"
              fill="#9A7340"
              stroke="#0B1B2B"
              strokeWidth="4"
            />
            <path
              d="M110 440 C 160 380, 170 480, 210 420"
              fill="none"
              stroke="#0B1B2B"
              strokeWidth="11"
              strokeLinecap="round"
            />
            <path
              d="M110 440 C 160 380, 170 480, 210 420"
              fill="none"
              stroke="#C9A36B"
              strokeWidth="5"
              strokeLinecap="round"
            />
          </svg>
          <GHFigure pose="gtangled" className="gh-error-figure f500" />
        </>
      )}
    </div>
  );
}
