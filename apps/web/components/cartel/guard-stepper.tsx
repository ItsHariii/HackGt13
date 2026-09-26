import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type GuardStep = {
  label: string;
  state: "done" | "current" | "pending" | "failed";
  /** e.g. "Sep 26, 10:44" or "Pending · merchant". */
  meta?: string | undefined;
};

const STATE_TEXT = {
  done: "done",
  current: "in progress",
  pending: "not started",
  failed: "failed",
} as const;

/**
 * The steps between signing and delivery: re-check → pay → confirmed →
 * shipped (Paid receipt design). A failed step stops the line.
 */
export function GuardStepper({
  steps,
  label = "Purchase progress",
}: {
  steps: GuardStep[];
  label?: string | undefined;
}) {
  return (
    <ol
      aria-label={label}
      className="flex flex-col gap-0 sm:flex-row sm:items-start"
    >
      {steps.map((s, i) => (
        <li
          key={s.label}
          aria-current={s.state === "current" ? "step" : undefined}
          className="flex flex-1 items-start gap-2.5 sm:flex-col sm:gap-2"
        >
          <span className="flex items-center sm:w-full">
            <span
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-full border-2 font-mono font-semibold text-[12px]",
                s.state === "done" &&
                  "border-green-check bg-green-check text-paper-raised",
                s.state === "failed" &&
                  "border-red-pen bg-red-pen text-paper-raised",
                s.state === "current" && "border-graphite text-graphite",
                s.state === "pending" &&
                  "border-pencil border-dashed text-muted",
              )}
            >
              {s.state === "done" ? (
                <Check size={14} strokeWidth={3} aria-hidden="true" />
              ) : s.state === "failed" ? (
                <X size={14} strokeWidth={3} aria-hidden="true" />
              ) : (
                i + 1
              )}
            </span>
            {i < steps.length - 1 && (
              <span
                aria-hidden="true"
                className={cn(
                  "mx-2 hidden h-px flex-1 sm:block",
                  s.state === "done"
                    ? "bg-graphite"
                    : "border-pencil border-t border-dashed",
                )}
              />
            )}
          </span>
          <span className="flex flex-col pb-3 sm:pb-0">
            <span className="font-semibold text-graphite text-ui">
              {s.label}
              <span className="sr-only">, {STATE_TEXT[s.state]}</span>
            </span>
            {s.meta && <span className="text-muted text-small">{s.meta}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}
