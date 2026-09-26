import { Check, LoaderCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type SourceState = "searching" | "done" | "error";

/**
 * One catalog source and its search state (Search design): "Shopify
 * Catalog ✓ 42". Zero results is a pass, not an error.
 */
export function SourcePill({
  name,
  state,
  count,
  className,
}: {
  name: string;
  state: SourceState;
  count?: number | undefined;
  className?: string | undefined;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-pill border px-3 font-semibold text-small",
        state === "error"
          ? "border-red-pen text-red-pen"
          : state === "searching"
            ? "border-pencil border-dashed text-muted"
            : "border-rule bg-paper-raised text-graphite",
        className,
      )}
    >
      {name}
      {state === "searching" && (
        <>
          <LoaderCircle
            size={13}
            aria-hidden="true"
            className="motion-safe:animate-spin"
          />
          <span className="font-normal">searching…</span>
        </>
      )}
      {state === "done" && (
        <>
          <Check
            size={13}
            strokeWidth={3}
            aria-hidden="true"
            className="text-green-check"
          />
          <span className="num">{count ?? 0}</span>
          <span className="sr-only">results</span>
        </>
      )}
      {state === "error" && (
        <>
          <X size={13} strokeWidth={3} aria-hidden="true" />
          <span className="font-normal">no response</span>
        </>
      )}
    </span>
  );
}
