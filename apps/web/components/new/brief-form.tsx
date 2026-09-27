"use client";
import { ArrowRight } from "lucide-react";
import { useActionState, useId, useState } from "react";
import { type CreatePlanState, createPlan } from "@/app/(site)/new/actions";
import { Figure } from "@/components/doodle/figure";
import {
  detectPack,
  PACK_TITLE,
  type PackId,
  TEMPLATES,
} from "@/lib/pack-detect";
import { cn } from "@/lib/utils";

const MAX = 2000;

/** The brief (Brief design): notebook textarea, templates, pack chip. */
export function BriefForm() {
  const id = useId();
  const [state, action, pending] = useActionState<CreatePlanState, FormData>(
    createPlan,
    { error: null, brief: "" },
  );
  const [brief, setBrief] = useState(state.brief);
  const [template, setTemplate] = useState<string | null>(null);
  const [override, setOverride] = useState<PackId | null>(null);
  const detected = detectPack(brief);
  const pack = override ?? detected;
  const over = brief.length > MAX;

  return (
    <form action={action} className="flex flex-col gap-6">
      <div className="relative mt-7">
        <label
          htmlFor={`${id}-brief`}
          className="absolute -top-[30px] left-[104px] font-semibold text-[13px] text-muted uppercase tracking-[0.08em]"
        >
          Your brief
        </label>
        <textarea
          id={`${id}-brief`}
          name="brief"
          value={brief}
          onChange={(e) => {
            setBrief(e.target.value);
            setTemplate(null);
          }}
          rows={8}
          aria-describedby={`${id}-count ${id}-error`}
          aria-invalid={over || !!state.error}
          placeholder="Build my home office for under $1,000…"
          className="block min-h-[360px] w-full resize-y rounded-card border border-rule bg-paper-raised bg-[linear-gradient(90deg,transparent_79px,rgb(200_53_46/.4)_79px,rgb(200_53_46/.4)_80px,transparent_80px),repeating-linear-gradient(180deg,transparent_0,transparent_39px,#d9e1ee_39px,#d9e1ee_40px)] bg-local bg-[position:0_0,0_24px] pt-[30px] pr-12 pb-12 pl-[104px] font-sans text-[18px] text-graphite leading-[40px] shadow-[3px_3px_0_-1px_#f4eedf,3px_3px_0_0_var(--color-rule),6px_6px_0_-1px_#f4eedf,6px_6px_0_0_var(--color-rule),0_24px_40px_-28px_rgb(43_42_40/.45)] outline-none placeholder:text-muted focus-visible:outline-[2.5px] focus-visible:outline-ink focus-visible:outline-offset-[6px] sm:text-[22px] dark:bg-paper-sheet dark:bg-[repeating-linear-gradient(180deg,transparent_0,transparent_39px,var(--color-rule)_39px,var(--color-rule)_40px)]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-[75px] right-12 z-[2] hidden sm:block"
        >
          <Figure who="scout" pose="idle" h={96} />
        </div>
        <p
          id={`${id}-count`}
          className={cn(
            "num absolute right-6 bottom-3.5 font-mono text-[12px]",
            over ? "font-semibold text-red-pen" : "text-muted",
          )}
        >
          {brief.length.toLocaleString("en-US")} / 2,000
          {over && " · too long"}
        </p>
      </div>

      <fieldset className="flex flex-col gap-2.5">
        <legend className="pb-3 font-semibold text-[13px] text-muted uppercase tracking-[0.08em]">
          Or start from a template
        </legend>
        <div className="flex flex-wrap gap-2">
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-pressed={template === t.id}
              onClick={() => {
                setBrief(t.brief);
                setTemplate(t.id);
                setOverride(null);
              }}
              className={cn(
                "inline-flex h-10 items-center gap-2 rounded-pill border px-4 text-[15px]",
                template === t.id
                  ? "border-graphite bg-graphite font-semibold text-paper-raised"
                  : "border-rule bg-paper-raised font-medium text-graphite hover:border-graphite",
              )}
            >
              {template === t.id && (
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 12 12"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M2.5 6.2l2.3 2.3 4.7-5" />
                </svg>
              )}
              {t.label}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3 text-small">
        <span className="text-muted">Rule pack</span>
        <output
          aria-live="polite"
          htmlFor={`${id}-brief`}
          className={cn(
            "inline-flex h-7 items-center rounded-pill border px-3 font-semibold",
            pack
              ? "border-ink text-ink"
              : "border-pencil border-dashed text-muted",
          )}
        >
          {pack
            ? `${PACK_TITLE[pack]}${override ? "" : " · detected"}`
            : "None detected yet"}
        </output>
        <label className="flex items-center gap-2">
          <span className="sr-only">Change rule pack</span>
          <select
            name="pack"
            value={override ?? ""}
            onChange={(e) =>
              setOverride((e.target.value || null) as PackId | null)
            }
            className="h-9 rounded-card border border-rule bg-paper-raised px-2 text-graphite"
          >
            <option value="">
              {detected ? "Keep detected" : "Detect from brief"}
            </option>
            {(Object.keys(PACK_TITLE) as PackId[]).map((p) => (
              <option key={p} value={p}>
                {PACK_TITLE[p]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <p
        id={`${id}-error`}
        role="alert"
        className={cn(
          "text-small",
          state.error && "border-red-pen border-l-2 pl-3 text-red-pen",
        )}
      >
        {state.error}
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-5 border-rule border-t pt-6">
        <p className="flex-1 text-[14px] text-muted leading-normal">
          Next you&apos;ll see the rules I pulled from this. Nothing is bought
          until you sign a contract.
        </p>
        <button
          type="submit"
          disabled={pending || over || !brief.trim()}
          className="inline-flex h-14 items-center gap-2.5 rounded-card bg-graphite px-[30px] font-semibold text-[17px] text-paper-raised shadow-primary hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "Reading your brief…" : "Build my plan"}
          <ArrowRight size={16} aria-hidden="true" />
        </button>
      </div>
    </form>
  );
}
