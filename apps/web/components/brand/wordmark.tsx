import Link from "next/link";
import { cn } from "@/lib/utils";

/** The stamped cart seal, drawn in ink and slightly rotated like a stamp. */
export function CartelSeal({ size = 29 }: { size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 -rotate-6 text-ink [filter:url(#stamp)]"
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="16" cy="16" r="14.6" />
        <circle
          cx="16"
          cy="16"
          r="11.6"
          strokeWidth=".9"
          strokeDasharray="1.2 2.3"
        />
        <path d="M10.4 12.3H21.6" />
        <path
          d="M12.4 12.1C12.4 8.7 13.7 7.5 16 7.5S19.6 8.7 19.6 12.1Z"
          fill="currentColor"
        />
        <path d="M8.8 15H10.6L12.2 21.4H20.4L21.9 16.3H11" />
        <circle cx="13.3" cy="23.9" r="1.2" fill="currentColor" />
        <circle cx="19.5" cy="23.9" r="1.2" fill="currentColor" />
      </svg>
    </span>
  );
}

export function Wordmark({
  size = 29,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <Link
      href="/"
      aria-label="Cartel home"
      className={cn(
        "flex items-center gap-[9px] font-serif font-bold tracking-[-0.035em] text-graphite",
        className,
      )}
    >
      <CartelSeal size={size} />
      Cartel
    </Link>
  );
}
