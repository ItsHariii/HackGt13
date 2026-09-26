import type { RowKind } from "@/lib/workspace";

/** Status marks differ by shape, not only color (SDD §17.2). */
export function StatusIcon({
  kind,
  size = 22,
}: {
  kind: RowKind | "done";
  size?: number;
}) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 20 20",
  } as const;
  switch (kind) {
    case "pass":
    case "done":
      return (
        <svg
          {...common}
          aria-hidden="true"
          className="shrink-0 text-green-check"
        >
          <circle cx="10" cy="10" r="9" fill="currentColor" />
          <path
            d="M5.8 10.4l2.8 2.8 5.6-6"
            fill="none"
            className="stroke-paper-raised"
            strokeWidth="2.1"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "fail":
      return (
        <svg {...common} aria-hidden="true" className="shrink-0 text-red-pen">
          <rect
            x="1.5"
            y="1.5"
            width="17"
            height="17"
            rx="3"
            fill="currentColor"
          />
          <path
            d="M6.5 6.5l7 7M13.5 6.5l-7 7"
            className="stroke-paper-raised"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        </svg>
      );
    case "est":
      return (
        <svg {...common} aria-hidden="true" className="shrink-0 text-graphite">
          <circle
            cx="10"
            cy="10"
            r="8.3"
            fill="none"
            className="stroke-pencil"
            strokeWidth="1.4"
            strokeDasharray="2.4 2"
          />
          <path
            d="M5.8 11c1.4-2.2 2.8-2.2 4.2 0s2.8 2.2 4.2 0"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      );
    case "cant":
      return (
        <svg {...common} aria-hidden="true" className="shrink-0 text-graphite">
          <circle
            cx="10"
            cy="10"
            r="8.3"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <text
            x="10"
            y="14.2"
            textAnchor="middle"
            fontWeight="700"
            fontSize="11.5"
            fill="currentColor"
            className="font-sans"
          >
            ?
          </text>
        </svg>
      );
  }
}
