"use client";
import { useActionState, useEffect, useRef } from "react";
import { type SolveState, solvePlan } from "@/app/plans/[id]/actions";
import { primary } from "@/components/states/edge-states";

/**
 * "Find plans" for a saved plan. Solving reads every candidate's product
 * page and quotes each basket through GreatHub, so it takes a while; the
 * button says what it's doing. `autoStart` runs it once on arrival from the
 * requirements page.
 */
export function SolveButton({
  planId,
  autoStart = false,
}: {
  planId: string;
  autoStart?: boolean;
}) {
  const [state, run, pending] = useActionState<SolveState, FormData>(
    (prev) => solvePlan(planId, prev),
    { error: null },
  );
  const form = useRef<HTMLFormElement>(null);
  const started = useRef(false);
  useEffect(() => {
    if (!autoStart || started.current) return;
    started.current = true;
    form.current?.requestSubmit();
  }, [autoStart]);
  return (
    <form ref={form} action={run} className="flex flex-col gap-2">
      <button
        type="submit"
        disabled={pending}
        className={`${primary} disabled:cursor-wait disabled:opacity-60`}
      >
        {pending ? "Finding plans…" : "Find plans"}
      </button>
      <p aria-live="polite" className="max-w-[46ch] text-muted text-small">
        {pending
          ? "Reading GreatHub's product pages, checking each against your rules, then pricing each plan through GreatHub's checkout."
          : state.error}
      </p>
    </form>
  );
}
