"use client";
import { ArrowRight } from "lucide-react";
import { useActionState, useId, useState } from "react";
import { type CreatePlanState, createPlan } from "@/app/(site)/new/actions";
import { Figure } from "@/components/doodle/figure";
import { Button } from "@/components/ui/button";
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
      <div className="relative">
        <label htmlFor={`${id}-brief`} className="sr-only">
          What do you need?
        </label>
        <textarea
          id={`${id}-brief`}
          name="brief"
          value={brief}
          onChange={(e) => {
            setBrief(e.target.value);
            setTemplate(null);
          }}
          rows={7}
          aria-describedby={`${id}-count ${id}-error`}
          aria-invalid={over || !!state.error}
          placeholder="Build my home office for under $1,000…"
          className="notebook block w-full resize-y rounded-sheet border border-graphite bg-paper-sheet py-[9px] pr-5 pl-16 font-serif text-[19px] text-graphite leading-[40px] outline-none placeholder:text-muted"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-[86px] right-6 hidden sm:block"
        >
          <Figure who="scout" pose="idle" h={88} />
        </div>
        <p
          id={`${id}-count`}
          className={cn(
            "num mt-2 text-right text-small",
            over ? "font-semibold text-red-pen" : "text-muted",
          )}
        >
          {brief.length.toLocaleString("en-US")} / 2,000
          {over && " · too long"}
        </p>
      </div>

      <fieldset className="flex flex-col gap-2.5">
        <legend className="pb-2 font-semibold text-meta text-muted uppercase tracking-label">
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
                "inline-flex h-10 items-center rounded-pill border px-4 font-semibold text-ui",
                template === t.id
                  ? "border-graphite bg-graphite text-paper-raised"
                  : "border-rule bg-paper-raised text-graphite hover:border-graphite",
              )}
            >
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

      <div className="flex flex-wrap items-center justify-between gap-4 border-rule border-t pt-5">
        <p className="max-w-[46ch] text-graphite-2 text-ui">
          Next you'll see the rules I pulled from this.{" "}
          <strong>Nothing is bought until you sign a contract.</strong>
        </p>
        <Button type="submit" disabled={pending || over || !brief.trim()}>
          {pending ? "Reading your brief…" : "Build my plan"}
          <ArrowRight size={16} aria-hidden="true" />
        </Button>
      </div>
    </form>
  );
}
