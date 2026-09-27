"use client";
import { useActionState } from "react";
import { primary } from "@/components/states/edge-states";
import { type DraftState, draftContractAction } from "./actions";

const input =
  "h-10 rounded-card border border-rule bg-paper-sheet px-2.5 text-graphite";

const PRESETS = [
  {
    id: "strict",
    title: "Strict",
    text: "Any change at all waits for you.",
  },
  {
    id: "balanced",
    title: "Balanced",
    text: "A total up to 2% or $5 higher may go ahead; everything else waits.",
  },
  {
    id: "flexible",
    title: "Flexible",
    text: "A total up to 5% or $20 higher may go ahead; everything else waits.",
  },
] as const;

/** The draft form: where it ships, how much may change, what can't be checked. */
export function DraftForm({
  planId,
  label,
  cant,
}: {
  planId: string;
  label: string;
  /** Hard rules nothing could check, to accept as waivers. */
  cant: { requirementId: string; rule: string; evidence: string }[];
}) {
  const [state, run, pending] = useActionState<DraftState, FormData>(
    (prev, form) => draftContractAction(planId, prev, form),
    { error: null },
  );
  return (
    <form action={run} className="flex flex-col gap-8">
      <input type="hidden" name="plan" value={label} />
      <fieldset className="flex flex-col gap-3">
        <legend className="pb-2 font-semibold font-serif text-h4">
          Ship to
        </legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              ["name", "Full name", "name", true],
              ["line_one", "Address line 1", "address-line1", true],
              ["line_two", "Address line 2", "address-line2", false],
              ["city", "City", "address-level2", true],
              ["state", "State", "address-level1", true],
              ["postal_code", "ZIP code", "postal-code", true],
            ] as const
          ).map(([name, label, auto, required]) => (
            <label key={name} className="flex flex-col gap-1 text-small">
              {label}
              {!required && <span className="text-muted">Optional</span>}
              <input
                name={name}
                autoComplete={auto}
                required={required}
                className={input}
              />
            </label>
          ))}
          <input type="hidden" name="country" value="US" />
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="pb-2 font-semibold font-serif text-h4">
          What Cartel may change without asking
        </legend>
        <div className="grid gap-3 sm:grid-cols-3">
          {PRESETS.map((p) => (
            <label
              key={p.id}
              className="flex cursor-pointer flex-col gap-1 rounded-card border border-rule bg-paper-sheet p-4 has-[:checked]:border-graphite has-[:checked]:shadow-primary"
            >
              <span className="flex items-center gap-2 font-semibold">
                <input
                  type="radio"
                  name="preset"
                  value={p.id}
                  defaultChecked={p.id === "balanced"}
                />
                {p.title}
              </span>
              <span className="text-muted text-small">{p.text}</span>
            </label>
          ))}
        </div>
        <p className="text-muted text-small">
          A different item, a failed rule or anything over your maximum always
          waits for a new signature.
        </p>
      </fieldset>

      {cant.length > 0 && (
        <fieldset className="flex flex-col gap-3">
          <legend className="pb-2 font-semibold font-serif text-h4">
            Rules nothing could check
          </legend>
          <p className="text-graphite-2 text-small">
            The contract can only be signed once you accept each of these as
            can't check. They stay listed in the contract as waivers.
          </p>
          {cant.map((c) => (
            <label
              key={c.requirementId}
              className="flex items-start gap-3 rounded-card border border-pencil border-dashed p-3"
            >
              <input
                type="checkbox"
                name="waive"
                value={c.requirementId}
                required
                className="mt-1"
              />
              <span className="flex flex-col">
                <span className="font-semibold">{c.rule}</span>
                <span className="text-muted text-small">{c.evidence}</span>
              </span>
            </label>
          ))}
        </fieldset>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={pending}
          className={`${primary} disabled:cursor-wait disabled:opacity-60`}
        >
          {pending ? "Drafting the contract…" : "Draft the contract"}
        </button>
        <p aria-live="polite" className="max-w-[56ch] text-small">
          {pending ? (
            <span className="text-muted">
              Opening a GreatHub checkout for these items, reading each product
              page again and proving it. Nothing is bought.
            </span>
          ) : (
            state.error && (
              <span role="alert" className="text-red-pen">
                {state.error}
              </span>
            )
          )}
        </p>
      </div>
    </form>
  );
}
