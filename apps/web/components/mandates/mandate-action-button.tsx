"use client";
import { useActionState } from "react";
import type { MandateActionState } from "@/app/(site)/mandates/actions";
import { cn } from "@/lib/utils";

const ERRORS: Record<string, string> = {
  mandate_expired: "This mandate's deadline has passed.",
  mandate_already_used: "This mandate was already used or cancelled.",
  mandate_not_armed:
    "The mandate is firing or finished, so it can't be cancelled now.",
  contract_superseded: "A newer version of this contract exists.",
  contract_not_signed: "The contract isn't in a signed state.",
  authentication_required: "Your session ended. Reload the page.",
};

/** One-button form for a mandate Server Action, with its error announced. */
export function MandateActionButton({
  action,
  name,
  value,
  label,
  pending,
  tone = "primary",
}: {
  action: (
    prev: MandateActionState,
    form: FormData,
  ) => Promise<MandateActionState>;
  name: string;
  value: string;
  label: string;
  pending: string;
  tone?: "primary" | "quiet";
}) {
  const [state, run, busy] = useActionState(action, null);
  return (
    <form action={run} className="flex flex-col items-end gap-1">
      <input type="hidden" name={name} value={value} />
      <button
        type="submit"
        disabled={busy}
        className={cn(
          "inline-flex h-10 items-center rounded-card px-4 font-semibold disabled:opacity-60",
          tone === "primary"
            ? "bg-graphite text-paper-raised shadow-primary"
            : "border border-graphite text-graphite",
        )}
      >
        {busy ? pending : label}
      </button>
      <p aria-live="polite" className="text-red-pen text-small">
        {state && !state.ok
          ? (ERRORS[state.error ?? ""] ?? "That didn't work. Try again.")
          : null}
      </p>
    </form>
  );
}
