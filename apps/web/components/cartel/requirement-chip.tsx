import { cn } from "@/lib/utils";

export type Provenance =
  | "said"
  | "chose"
  | "assumed"
  | "confirmed"
  | "default"
  | "cant";

const CHIP =
  "inline-flex h-5 items-center gap-1 whitespace-nowrap rounded-[3px] px-1.5 font-semibold text-meta";

/**
 * Where a rule came from (Style Tile v2: You said / You chose / I assumed /
 * Default). Solid ink is the buyer's own words, dashed pencil is a guess.
 */
export function RequirementChip({
  kind,
  quote,
}: {
  kind: Provenance;
  /** The brief's words behind a "You said" rule, shown on hover and to screen readers. */
  quote?: string | undefined;
}) {
  const title = quote ? `From your brief: “${quote}”` : undefined;
  switch (kind) {
    case "said":
      return (
        <span title={title} className={cn(CHIP, "bg-ink text-paper-raised")}>
          You said
          {quote && <span className="sr-only">: “{quote}”</span>}
        </span>
      );
    case "chose":
      return (
        <span className={cn(CHIP, "bg-ink text-paper-raised")}>You chose</span>
      );
    case "confirmed":
      return (
        <span className={cn(CHIP, "border border-ink text-ink")}>
          I assumed → confirmed
        </span>
      );
    case "default":
      return <span className={cn(CHIP, "bg-tag text-graphite")}>Default</span>;
    case "assumed":
      return (
        <span
          className={cn(CHIP, "border border-pencil border-dashed text-muted")}
        >
          I assumed
        </span>
      );
    case "cant":
      return (
        <span className={cn(CHIP, "border border-graphite text-graphite")}>
          <span aria-hidden="true">?</span> Can't check
        </span>
      );
  }
}
