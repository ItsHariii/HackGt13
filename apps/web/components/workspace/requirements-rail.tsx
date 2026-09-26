import Link from "next/link";
import { RequirementChip } from "@/components/cartel/requirement-chip";
import { cn } from "@/lib/utils";
import type { RequirementKind, RequirementView } from "@/lib/workspace";

const TEXT_TONE: Record<RequirementKind, string> = {
  said: "text-ink",
  chose: "text-ink",
  confirmed: "text-ink",
  default: "text-ink",
  assumed: "text-muted",
  cant: "text-graphite",
};

function Provenance({ kind }: { kind: RequirementKind }) {
  if (kind === "assumed")
    return (
      <>
        <RequirementChip kind="assumed" />
        <span className="font-semibold text-ink">
          Not checked until confirmed
        </span>
      </>
    );
  if (kind === "cant")
    return (
      <>
        <RequirementChip kind="cant" />
        <span>Waived by you</span>
      </>
    );
  return <RequirementChip kind={kind} />;
}

export function RequirementsRail({
  planId,
  requirements,
}: {
  planId: string;
  requirements: RequirementView[];
}) {
  return (
    <section
      aria-labelledby="requirements-heading"
      className="flex min-h-0 flex-col gap-2.5"
    >
      <div className="flex items-baseline justify-between border-graphite border-b px-1 pb-2.5">
        <h2
          id="requirements-heading"
          className="font-bold text-meta uppercase tracking-label"
        >
          Requirements
        </h2>
        <Link
          href={`/plans/${planId}/requirements`}
          className="text-ink text-small underline underline-offset-[3px] hover:text-graphite"
        >
          Edit
        </Link>
      </div>
      <ul
        // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrolling pane must be reachable by keyboard (WCAG 2.1.1)
        tabIndex={0}
        aria-label="Requirements list"
        className="flex min-h-0 flex-col gap-2.5 overflow-y-auto pb-2"
      >
        {requirements.map((r) => (
          <li
            key={r.id}
            className={cn(
              "flex flex-col gap-1.5 rounded-card border bg-paper-raised px-3 py-2.5",
              r.kind === "assumed"
                ? "border-pencil border-dashed"
                : "border-rule",
            )}
          >
            <div className="flex items-start gap-2">
              <span
                className={cn(
                  "flex-1 font-semibold text-[14px] leading-[1.35]",
                  TEXT_TONE[r.kind],
                )}
              >
                {r.text}
              </span>
              <span
                className="shrink-0 rounded-[3px] border border-rule px-1 font-mono font-semibold text-[11px] text-muted"
                title={
                  r.strength === "HARD"
                    ? "Hard rule"
                    : r.strength === "PREF"
                      ? "Preference"
                      : "Not checked"
                }
              >
                {r.strength}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-meta text-muted">
              <Provenance kind={r.kind} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
