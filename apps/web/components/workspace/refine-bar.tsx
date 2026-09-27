"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  applyRefinement,
  previewRefinement,
  type RefinePreview,
} from "@/app/plans/[id]/refine-actions";
import { CommandBar as Bar } from "@/components/cartel/command-bar";
import { primary } from "@/components/states/edge-states";

const SIGN = { add: "+", remove: "−", change: "~" } as const;

/**
 * The refinement bar for a saved plan (TASKS T11.3; SDD §10.1 A4): a
 * sentence becomes a rule diff, the shopper confirms, the rules are saved
 * as a new set and the plan is solved again. Changed basket lines are
 * marked in the plan panel after the refresh.
 */
export function RefineBar({ planId }: { planId: string }) {
  const router = useRouter();
  const [preview, setPreview] = useState<RefinePreview | null>(null);
  const [asking, startAsk] = useTransition();
  const [applying, startApply] = useTransition();
  const [note, setNote] = useState("");

  const ask = (text: string) => {
    setNote("");
    startAsk(async () => setPreview(await previewRefinement(planId, text)));
  };
  const confirm = () => {
    if (preview?.status !== "ok") return;
    startApply(async () => {
      const result = await applyRefinement(
        planId,
        preview.setVersion,
        preview.patches,
      );
      if (result.status === "error") {
        setPreview({ status: "error", message: result.message });
        return;
      }
      setPreview(null);
      setNote(
        result.solved
          ? "Rules updated and plans found again. Changed items are marked."
          : "Rules updated. Find plans again to see new baskets.",
      );
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-3">
      {preview && (
        <section
          aria-label="Proposed change"
          className="rounded-card border border-graphite bg-paper-raised p-4 shadow-stack-1"
        >
          {preview.status === "error" ? (
            <p role="alert" className="text-small">
              {preview.message}{" "}
              {preview.manual && (
                <Link
                  href={`/plans/${planId}/requirements`}
                  className="text-ink underline underline-offset-4"
                >
                  Edit rules
                </Link>
              )}
            </p>
          ) : preview.lines.length === 0 ? (
            <p className="text-small">
              Nothing to change.
              {preview.unhandled.length > 0 &&
                ` I couldn't turn this into a rule: ${preview.unhandled.join("; ")}.`}
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              <h2 className="font-semibold text-meta uppercase tracking-label">
                Proposed rule changes
              </h2>
              <ul className="flex flex-col gap-1.5 font-mono text-small">
                {preview.lines.map((l, i) => (
                  <li
                    // biome-ignore lint/suspicious/noArrayIndexKey: lines are a fixed preview
                    key={i}
                    className={
                      l.kind === "remove"
                        ? "text-red-pen"
                        : l.kind === "add"
                          ? "text-green-check"
                          : ""
                    }
                  >
                    <span aria-hidden="true">{SIGN[l.kind]} </span>
                    {l.kind === "add"
                      ? `Add: ${l.after}`
                      : l.kind === "remove"
                        ? `Remove: ${l.before}`
                        : `${l.before} → ${l.after}`}
                  </li>
                ))}
              </ul>
              {preview.unhandled.length > 0 && (
                <p className="text-muted text-small">
                  Not changed: {preview.unhandled.join("; ")}.
                </p>
              )}
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={confirm}
                  disabled={applying}
                  className={`${primary} disabled:cursor-wait disabled:opacity-60`}
                >
                  {applying ? "Finding plans again…" : "Apply and find plans"}
                </button>
                <button
                  type="button"
                  onClick={() => setPreview(null)}
                  disabled={applying}
                  className="min-h-11 px-3 font-semibold text-ui underline underline-offset-4"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </section>
      )}
      <p aria-live="polite" className="sr-only">
        {asking ? "Reading your change…" : note}
      </p>
      {note && <p className="text-muted text-small">{note}</p>}
      <Bar
        label="Ask Cartel to refine this plan"
        placeholder={
          asking
            ? "Reading your change…"
            : "Ask Cartel… e.g. 'Make it $100 cheaper without changing the monitor'"
        }
        onSubmit={ask}
      />
    </div>
  );
}
