import { cn } from "@/lib/utils";

export type StampTone = "signed" | "paid" | "blocked" | "paused";

const TONE: Record<StampTone, string> = {
  signed: "text-red-pen",
  paid: "text-green-check",
  blocked: "text-red-pen",
  paused: "text-red-pen",
};
const MARK: Partial<Record<StampTone, string>> = { paid: "✓ ", blocked: "✗ " };

/**
 * A committed state, drawn as a rubber stamp ("SIGNED v7", "✓ PAID",
 * "✗ BLOCKED"). Uneven ink comes from the shared #stamp filter. The stamp
 * is plain text, so screen readers read it as written.
 */
export function Stamp({
  tone,
  children,
  detail,
  size = "md",
  className,
}: {
  tone: StampTone;
  children: string;
  /** A second, smaller line, e.g. the signing time. */
  detail?: string | undefined;
  size?: "sm" | "md" | "lg";
  className?: string | undefined;
}) {
  return (
    <span
      className={cn(
        "stamp inline-flex flex-col items-center normal-case leading-none [filter:url(#stamp)]",
        size === "sm" && "border-2 px-2 py-1 text-[12px]",
        size === "md" && "text-[18px]",
        size === "lg" && "border-4 px-4 py-2 text-[40px]",
        TONE[tone],
        className,
      )}
    >
      <span className="block">
        {MARK[tone] && <span aria-hidden="true">{MARK[tone]}</span>}
        {children}
      </span>
      {detail && (
        <span className="mt-1 block text-[0.55em] tracking-[0.08em]">
          {detail}
        </span>
      )}
    </span>
  );
}
