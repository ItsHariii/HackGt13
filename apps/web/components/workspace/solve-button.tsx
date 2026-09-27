"use client";
import { primary } from "@/components/states/edge-states";
import { useSolve } from "./live-solve";

/**
 * "Find plans" for a saved plan, inside a SolveStage: starting it swaps the
 * card for the live proof list. Shows why the last attempt failed.
 */
export function SolveButton() {
  const { start, running, error } = useSolve();
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={start}
        disabled={running}
        className={`${primary} disabled:cursor-wait disabled:opacity-60`}
      >
        {error ? "Find plans again" : "Find plans"}
      </button>
      {error && (
        <p role="alert" className="max-w-[46ch] text-red-pen text-small">
          {error}
        </p>
      )}
    </div>
  );
}
