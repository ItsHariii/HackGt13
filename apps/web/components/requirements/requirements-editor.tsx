"use client";
import type {
  Importance,
  Operator,
  Requirement,
  Unit,
} from "@cartel/contracts";
import { PACKS } from "@cartel/rule-packs";
import { ArrowRight, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import {
  type FormEvent,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { saveRequirements } from "@/app/plans/[id]/requirements/actions";
import { RequirementChip } from "@/components/cartel/requirement-chip";
import { AiOff } from "@/components/states/edge-states";
import { Button } from "@/components/ui/button";
import type { DraftLine } from "@/lib/brief-draft";
import { splitLines } from "@/lib/figure-events";
import {
  type FieldOption,
  fieldOptions,
  manualRule,
  OP_LABEL,
  opsFor,
  retarget,
  targetInput,
} from "@/lib/manual-rule";
import { cn } from "@/lib/utils";
import { ruleText } from "@/lib/workspace";

export type Question = {
  id: string;
  text: string;
  /** The rule this question qualifies. */
  requirementId: string;
  /** Why it's being asked (AI questions); shown under the question. */
  why?: string;
  /** Empty for an open AI question: the answer is a rule added by hand. */
  options: { label: string; rule: string }[];
};

type DraftState = "idle" | "reading" | "done" | "off" | "unavailable";

/** An A1 question as the editor shows it. */
function fromAiQuestion(
  q: { field: string | null; question: string; why: string },
  i: number,
): Question {
  return {
    id: `ai_q_${i}`,
    text: q.question,
    requirementId: q.field ?? "",
    why: q.why,
    options: [],
  };
}

type Group = "said" | "assumed" | "default";

function groupOf(r: Requirement): Group {
  switch (r.provenance.kind) {
    case "user_stated":
    case "user_selected":
      return "said";
    case "ai_inferred":
      return "assumed";
    case "pack_default":
      return "default";
  }
}

/**
 * Requirements review (TASKS T11.2): "Here's what I understood." Three
 * groups plus open questions; every rule can be edited, made hard or a
 * preference, or removed, and new ones added by hand with no AI at all.
 */
export function RequirementsEditor({
  planId,
  brief,
  packIds,
  initial,
  questions: givenQuestions = [],
  mode,
  draftUrl,
}: {
  planId: string;
  brief: string;
  packIds: string[];
  initial: Requirement[];
  questions?: Question[];
  /** Demo plans keep edits in the page; stored plans save a new set. */
  mode: "demo" | "stored";
  /** A1 stream for a saved plan with no rules yet (`/api/plans/[id]/draft`). */
  draftUrl?: string;
}) {
  const [packList, setPackList] = useState(packIds);
  const packs = useMemo(
    () => packList.flatMap((p) => (PACKS[p] ? [PACKS[p]] : [])),
    [packList],
  );
  const options = useMemo(() => fieldOptions(packs), [packs]);
  const [rules, setRules] = useState(initial);
  const [aiQuestions, setAiQuestions] = useState<Question[]>([]);
  const questions = useMemo(
    () => [...givenQuestions, ...aiQuestions],
    [givenQuestions, aiQuestions],
  );
  const [draft, setDraft] = useState<DraftState>(
    draftUrl && initial.length === 0 ? "reading" : "idle",
  );
  const touched = useRef(false);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [hover, setHover] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [builderOpen, setBuilderOpen] = useState(
    initial.length === 0 && !draftUrl,
  );
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, startSave] = useTransition();
  const builder = useRef<HTMLDetailsElement>(null);
  const changed = rules !== initial;

  const quoteSpan = (() => {
    const r = rules.find((x) => x.id === hover);
    return r?.provenance.kind === "user_stated" ? r.provenance.span : null;
  })();

  useEffect(() => {
    if (!draftUrl || initial.length > 0) return;
    const abort = new AbortController();
    const apply = (reqs: Requirement[]) => {
      // Once the shopper edits, drafts only add rules they don't have yet.
      setRules((rs) =>
        touched.current
          ? [...rs, ...reqs.filter((r) => !rs.some((x) => x.id === r.id))]
          : reqs,
      );
    };
    const handle = (line: DraftLine) => {
      if (line.type === "error") {
        setDraft(line.reason);
        setBuilderOpen(true);
        return;
      }
      apply(line.requirements);
      setAiQuestions(line.questions.map(fromAiQuestion));
      if (line.type === "done") {
        if (line.pack && PACKS[line.pack])
          setPackList((p) => (p.length ? p : [line.pack as string]));
        setDraft("done");
        setStatus(
          `Read your brief: ${line.requirements.length} rules, ${line.questions.length} questions.`,
        );
      }
    };
    (async () => {
      try {
        const res = await fetch(draftUrl, {
          method: "POST",
          signal: abort.signal,
        });
        if (!res.ok || !res.body) throw new Error(`draft ${res.status}`);
        const reader = res.body
          .pipeThrough(new TextDecoderStream())
          .getReader();
        let buffer = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          const { lines, rest } = splitLines(buffer + value);
          buffer = rest;
          for (const l of lines) if (l.trim()) handle(JSON.parse(l));
        }
        if (buffer.trim()) handle(JSON.parse(buffer));
        setDraft((d) => (d === "reading" ? "unavailable" : d));
      } catch {
        if (abort.signal.aborted) return;
        setDraft("unavailable");
        setBuilderOpen(true);
      }
    })();
    return () => abort.abort();
  }, [draftUrl, initial.length]);

  const update = (id: string, next: Requirement | null, message: string) => {
    touched.current = true;
    setRules((rs) =>
      next
        ? rs.map((r) => (r.id === id ? next : r))
        : rs.filter((r) => r.id !== id),
    );
    setStatus(message);
  };

  const text = (r: Requirement) => ruleText(r, packs);
  const groups: Record<Group, Requirement[]> = {
    said: [],
    assumed: [],
    default: [],
  };
  for (const r of rules) groups[groupOf(r)].push(r);
  const toConfirm = groups.assumed.filter(
    (r) => r.provenance.kind === "ai_inferred" && !r.provenance.confirmed,
  ).length;
  const openQuestions = questions.filter((q) => answers[q.id] === undefined);

  const findPlans = () => {
    setError(null);
    if (mode === "demo") return;
    startSave(async () => {
      const result = await saveRequirements(planId, rules);
      if (result?.error) setError(result.error);
    });
  };

  const rowProps = (r: Requirement) => ({
    rule: r,
    text: text(r),
    field: options.find((o) => o.field === r.field),
    editing: editing === r.id,
    onEdit: () => setEditing(editing === r.id ? null : r.id),
    onSave: (next: Requirement) => {
      setEditing(null);
      update(r.id, next, `Saved: ${text(next)}.`);
    },
    onRemove: () => update(r.id, null, `Removed: ${text(r)}.`),
    onHover: setHover,
  });

  return (
    <div className="grid items-start gap-12 lg:grid-cols-[minmax(0,1fr)_420px]">
      <div className="flex flex-col gap-11 pb-36">
        {draft === "reading" && (
          <p
            role="status"
            className="flex items-center gap-2.5 rounded-card border border-pencil border-dashed px-4 py-3 text-graphite-2 text-small"
          >
            <span
              aria-hidden="true"
              className="size-2 animate-pulse rounded-full bg-ink motion-reduce:animate-none"
            />
            Reading your brief. Rules appear as I find them; nothing is checked
            until you confirm.
          </p>
        )}
        {(draft === "off" || draft === "unavailable") && (
          <AiOff href="#manual-builder" />
        )}
        <Section
          variant="said"
          note="Taken from your brief"
          title="You said"
          empty={
            draft === "reading"
              ? "Reading your brief…"
              : "Nothing yet. Add a rule by hand below."
          }
          count={groups.said.length}
        >
          {groups.said.map((r) => (
            <RuleRow key={r.id} {...rowProps(r)}>
              <StrengthToggle
                value={r.importance}
                label={text(r)}
                onChange={(importance) => {
                  const { weight: _w, ...rest } = r;
                  update(
                    r.id,
                    {
                      ...rest,
                      importance,
                      ...(importance === "preference" ? { weight: 0.5 } : {}),
                    },
                    `${text(r)} is now ${importance === "hard" ? "a hard rule" : "a preference"}.`,
                  );
                }}
              />
            </RuleRow>
          ))}
        </Section>

        {groups.assumed.length > 0 && (
          <Section
            variant="assumed"
            note="Not checked until you confirm"
            title="I assumed, confirm?"
            count={groups.assumed.length}
          >
            {groups.assumed.map((r) => {
              const p = r.provenance;
              const confirmed = p.kind === "ai_inferred" && p.confirmed;
              return (
                <RuleRow key={r.id} {...rowProps(r)} assumed={!confirmed}>
                  {p.kind === "ai_inferred" && (
                    <p className="text-muted text-small">{p.rationale}</p>
                  )}
                  {confirmed ? (
                    <span className="text-small">
                      <RequirementChip kind="confirmed" />
                    </span>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-muted text-small">
                        Not checked as a hard rule until you confirm.
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        className="min-h-9 px-3 py-1"
                        onClick={() =>
                          p.kind === "ai_inferred" &&
                          update(
                            r.id,
                            { ...r, provenance: { ...p, confirmed: true } },
                            `Confirmed: ${text(r)}.`,
                          )
                        }
                      >
                        Confirm
                      </Button>
                    </div>
                  )}
                </RuleRow>
              );
            })}
          </Section>
        )}

        {questions.length > 0 && (
          <Section
            variant="question"
            note="I can't pick for you"
            title="Needs your answer"
            count={openQuestions.length}
          >
            {questions.map((q) => (
              <li
                key={q.id}
                className="flex flex-col gap-[18px] rounded-card border border-graphite bg-paper-raised px-6 pt-6 pb-[22px] text-graphite shadow-offset"
              >
                <p className="flex items-start gap-3.5 text-pretty font-semibold font-serif text-[23px] leading-[1.3] tracking-[-0.015em]">
                  <svg
                    width="28"
                    height="28"
                    viewBox="0 0 20 20"
                    aria-hidden="true"
                    className="mt-0.5 shrink-0"
                  >
                    <circle
                      cx="10"
                      cy="10"
                      r="8.3"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    />
                    <text
                      x="10"
                      y="14.2"
                      textAnchor="middle"
                      fontWeight="700"
                      fontSize="11.5"
                      fill="currentColor"
                    >
                      ?
                    </text>
                  </svg>
                  {q.text}
                </p>
                {q.why && (
                  <p className="text-muted text-small sm:pl-[42px]">{q.why}</p>
                )}
                {q.options.length === 0 ? (
                  <div className="flex flex-wrap gap-2.5 sm:pl-[42px]">
                    <Button
                      type="button"
                      variant="outline"
                      aria-pressed={answers[q.id] === 0}
                      onClick={() => {
                        setAnswers((a) => ({ ...a, [q.id]: 0 }));
                        setBuilderOpen(true);
                        builder.current?.scrollIntoView({ block: "center" });
                        setStatus("Add the rule by hand below.");
                      }}
                    >
                      Add a rule for this
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      aria-pressed={answers[q.id] === 1}
                      onClick={() => {
                        setAnswers((a) => ({ ...a, [q.id]: 1 }));
                        setStatus("Skipped. No rule added.");
                      }}
                    >
                      Doesn't matter
                    </Button>
                  </div>
                ) : (
                  <div
                    role="radiogroup"
                    aria-label={q.text}
                    className="grid gap-2.5 sm:grid-cols-2 sm:pl-[42px]"
                  >
                    {q.options.map((o, i) => (
                      // biome-ignore lint/a11y/useSemanticElements: a card-sized radio with a code preview
                      <button
                        key={o.label}
                        type="button"
                        role="radio"
                        aria-checked={answers[q.id] === i}
                        onClick={() => {
                          setAnswers((a) => ({ ...a, [q.id]: i }));
                          setStatus(`Answered: ${o.label}.`);
                        }}
                        className={cn(
                          "flex min-h-[52px] flex-col items-start gap-0.5 rounded-card border border-graphite bg-paper-sheet px-4 py-2.5 text-left",
                          answers[q.id] === i
                            ? "shadow-primary"
                            : "hover:bg-paper-raised",
                        )}
                      >
                        <span className="font-semibold text-[15px]">
                          {o.label}
                        </span>
                        <code className="font-mono text-[13px] text-muted">
                          {o.rule}
                        </code>
                      </button>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </Section>
        )}

        {groups.default.length > 0 && (
          <Section
            variant="default"
            note="From the rule pack"
            title="Defaults"
            count={groups.default.length}
          >
            {groups.default.map((r) => (
              <RuleRow key={r.id} {...rowProps(r)}>
                <span className="text-muted text-small">
                  <RequirementChip kind="default" />{" "}
                  {r.provenance.kind === "pack_default"
                    ? `${PACKS[r.provenance.pack]?.title ?? r.provenance.pack} pack`
                    : ""}
                </span>
              </RuleRow>
            ))}
          </Section>
        )}

        <details
          ref={builder}
          open={builderOpen}
          onToggle={(e) => setBuilderOpen(e.currentTarget.open)}
          className="sheet p-4 text-graphite"
          id="manual-builder"
        >
          <summary className="cursor-pointer font-semibold text-ui">
            Add a rule by hand
            <span className="ml-2 font-normal text-muted text-small">
              Works with the AI off
            </span>
          </summary>
          {options.length === 0 ? (
            <p className="pt-3 text-muted text-small">
              Pick a rule pack on the brief first; its fields appear here.
            </p>
          ) : (
            <RuleBuilder
              options={options}
              existing={rules.map((r) => r.id)}
              onAdd={(r) => {
                touched.current = true;
                setRules((rs) => [...rs, r]);
                setStatus(`Added: ${text(r)} (You chose).`);
              }}
            />
          )}
        </details>

        <p aria-live="polite" className="sr-only">
          {status}
        </p>
      </div>

      <aside aria-label="Your brief" className="order-first lg:order-none">
        <div className="sticky top-6 mt-2 flex flex-col gap-3.5">
          <div className="relative rotate-[.4deg] rounded-card border border-rule bg-paper-raised bg-[repeating-linear-gradient(180deg,transparent_0,transparent_31px,#e2e8f1_31px,#e2e8f1_32px)] bg-[position:0_58px] px-[26px] pt-6 pb-[26px] text-graphite shadow-[3px_3px_0_-1px_#f4eedf,3px_3px_0_0_var(--color-rule),6px_6px_0_-1px_#f4eedf,6px_6px_0_0_var(--color-rule),0_20px_34px_-24px_rgb(43_42_40/.4)] dark:bg-none">
            <span
              aria-hidden="true"
              className="absolute -top-[11px] left-10 h-6 w-[84px] -rotate-[4deg] bg-tape/90 [clip-path:polygon(3%_0,97%_6%,100%_50%,96%_100%,2%_94%,0_48%)]"
            />
            <div className="flex h-[34px] items-baseline justify-between">
              <h2 className="font-semibold text-[13px] text-muted uppercase tracking-[0.08em]">
                Your brief
              </h2>
              <Link
                href="/new"
                className="text-[14px] text-ink underline-offset-[3px] hover:underline"
              >
                Edit
              </Link>
            </div>
            <p className="font-serif text-[18px] text-graphite leading-8">
              {quoteSpan ? (
                <>
                  {brief.slice(0, quoteSpan[0])}
                  <mark className="mark-highlight text-graphite">
                    {brief.slice(quoteSpan[0], quoteSpan[1])}
                  </mark>
                  {brief.slice(quoteSpan[1])}
                </>
              ) : (
                brief || "No brief. Rules were added by hand."
              )}
            </p>
          </div>
          <p className="px-1 text-[13px] text-muted leading-normal">
            Hover a rule to see the words it came from.
          </p>
        </div>
      </aside>

      <div className="fixed inset-x-0 bottom-0 z-10 border-graphite border-t bg-paper-raised">
        <div className="flex min-h-24 flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3 sm:px-16">
          <p className="num text-[15px] text-graphite-2">
            {rules.length} rules · {toConfirm} to confirm ·{" "}
            {openQuestions.length}{" "}
            {openQuestions.length === 1 ? "question" : "questions"}
          </p>
          <button
            type="button"
            onClick={() => {
              setBuilderOpen(true);
              builder.current?.scrollIntoView({ block: "center" });
              builder.current?.querySelector("summary")?.focus();
            }}
            className="order-last min-h-6 font-medium text-[15px] text-ink underline-offset-[3px] hover:underline sm:order-none"
          >
            Edit rules by hand (AI off)
          </button>
          <div className="flex-1" />
          {error && (
            <p role="alert" className="text-red-pen text-small">
              {error}
            </p>
          )}
          {mode === "demo" && changed && (
            <p className="text-muted text-small">
              Demo plan: your edits stay on this page.
            </p>
          )}
          {mode === "demo" ? (
            <Link
              href={`/plans/${planId}`}
              className="inline-flex h-[54px] items-center gap-2.5 rounded-card bg-graphite px-[30px] font-semibold text-[16px] text-paper-raised no-underline shadow-primary hover:opacity-90"
            >
              Find plans <ArrowRight size={16} aria-hidden="true" />
            </Link>
          ) : (
            <button
              type="button"
              onClick={findPlans}
              disabled={saving || rules.length === 0}
              className="inline-flex h-[54px] items-center gap-2.5 rounded-card bg-graphite px-[30px] font-semibold text-[16px] text-paper-raised shadow-primary hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Saving rules…" : "Find plans"}
              <ArrowRight size={16} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const SECTION = {
  said: {
    rule: "border-ink border-solid",
    chip: "bg-ink text-paper-raised",
  },
  assumed: {
    rule: "border-pencil border-dashed",
    chip: "border border-pencil border-dashed text-muted",
  },
  question: {
    rule: "border-graphite border-solid",
    chip: "border border-graphite text-graphite",
  },
  default: {
    rule: "border-rule border-solid",
    chip: "bg-tag text-muted",
  },
} as const;

/** A group of rules, headed by its provenance chip (Requirements design). */
function Section({
  title,
  count,
  variant,
  note,
  empty,
  children,
}: {
  title: string;
  count: number;
  variant: keyof typeof SECTION;
  note: string;
  empty?: string;
  children: React.ReactNode;
}) {
  const id = useId();
  const v = SECTION[variant];
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <div className={cn("flex items-center gap-3 border-b pb-2.5", v.rule)}>
        <h2
          id={id}
          className={cn(
            "inline-flex h-[26px] items-center gap-1.5 rounded-[5px] px-2.5 font-bold text-[12px] uppercase tracking-[0.08em]",
            v.chip,
          )}
        >
          {variant === "question" && <span aria-hidden="true">?</span>}
          {title}
        </h2>
        <span className="text-[14px] text-muted">{note}</span>
        <span className="flex-1" />
        <span className="font-mono text-[13px] text-muted">
          {count}{" "}
          {variant === "question"
            ? count === 1
              ? "question"
              : "questions"
            : count === 1
              ? "rule"
              : "rules"}
        </span>
      </div>
      {count === 0 && empty ? (
        <p className="text-muted text-small">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-3">{children}</ul>
      )}
    </section>
  );
}

function RuleRow({
  rule,
  text,
  field,
  editing,
  assumed = false,
  onEdit,
  onSave,
  onRemove,
  onHover,
  children,
}: {
  rule: Requirement;
  text: string;
  field: FieldOption | undefined;
  editing: boolean;
  assumed?: boolean;
  onEdit: () => void;
  onSave: (r: Requirement) => void;
  onRemove: () => void;
  onHover: (id: string | null) => void;
  children?: React.ReactNode;
}) {
  const quote =
    rule.provenance.kind === "user_stated" ? rule.provenance.quote : undefined;
  const hard = rule.importance === "hard" && !assumed;
  return (
    <li
      onMouseEnter={() => onHover(rule.id)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(rule.id)}
      onBlur={() => onHover(null)}
      className={cn(
        "flex flex-col gap-2.5 rounded-card border bg-paper-raised py-3.5 pr-3.5 pl-[18px] text-graphite transition-[border-color,box-shadow]",
        assumed
          ? "border-pencil border-dashed hover:border-muted"
          : "border-rule hover:border-ink hover:shadow-offset focus-within:border-ink",
      )}
    >
      <div className="flex flex-wrap items-start gap-3">
        <span
          aria-hidden="true"
          className={cn(
            "mt-1 size-3.5 shrink-0 rounded-[3px]",
            assumed
              ? "rounded-full border-[1.8px] border-pencil border-dashed"
              : "bg-ink",
          )}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span
            className={cn(
              "font-semibold text-[17px]",
              assumed ? "text-graphite-2" : "text-ink",
            )}
          >
            {text}
          </span>
          <span className="flex flex-wrap items-center gap-1.5 text-meta text-muted">
            {rule.provenance.kind === "user_stated" && (
              <RequirementChip kind="said" quote={quote} />
            )}
            {rule.provenance.kind === "user_selected" && (
              <RequirementChip kind="chose" />
            )}
            {rule.provenance.kind === "ai_inferred" && (
              <RequirementChip kind="assumed" />
            )}
            <span className="font-mono">{hard ? "HARD" : "PREF"}</span>
            {quote && (
              <span className="flex items-baseline gap-2 text-[14px]">
                From your brief:
                <span className="rounded-[2px] bg-highlighter/55 px-1 py-px font-serif text-[16px] text-graphite">
                  “{quote}”
                </span>
              </span>
            )}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {field && (
            <button
              type="button"
              onClick={onEdit}
              aria-expanded={editing}
              aria-label={`Edit ${text}`}
              className="inline-flex size-8 items-center justify-center rounded-[6px] border border-rule bg-paper-raised hover:border-graphite"
            >
              <Pencil size={14} aria-hidden="true" />
            </button>
          )}
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${text}`}
            className="inline-flex size-8 items-center justify-center rounded-[6px] border border-rule bg-paper-raised hover:border-red-pen hover:text-red-pen"
          >
            <Trash2 size={14} aria-hidden="true" />
          </button>
        </div>
      </div>
      {children && <div className="flex flex-col gap-2 pl-5">{children}</div>}
      {editing && field && (
        <EditTarget rule={rule} field={field} text={text} onSave={onSave} />
      )}
    </li>
  );
}

function StrengthToggle({
  value,
  label,
  onChange,
}: {
  value: Importance;
  label: string;
  onChange: (v: Importance) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={`Strength of ${label}`}
      className="flex h-8 w-fit overflow-hidden rounded-[6px] border border-graphite font-semibold text-[13px]"
    >
      {(["hard", "preference"] as const).map((v) => (
        // biome-ignore lint/a11y/useSemanticElements: a segmented control
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={cn(
            "px-3",
            value === v
              ? "bg-graphite text-paper-raised"
              : "text-graphite hover:bg-paper",
          )}
        >
          {v === "hard" ? "Hard" : "Preference"}
        </button>
      ))}
    </div>
  );
}

function ValueInput({
  field,
  value,
  unit,
  onValue,
  onUnit,
  id,
}: {
  field: FieldOption;
  value: string;
  unit: Unit | undefined;
  onValue: (v: string) => void;
  onUnit: (u: Unit) => void;
  id: string;
}) {
  const cls =
    "h-10 rounded-card border border-rule bg-paper-sheet px-2.5 text-graphite";
  if (field.kind === "boolean")
    return (
      <select
        id={id}
        value={value}
        onChange={(e) => onValue(e.target.value)}
        className={cls}
      >
        <option value="">Choose…</option>
        <option value="yes">yes</option>
        <option value="no">no</option>
      </select>
    );
  if (field.kind === "enum")
    return (
      <select
        id={id}
        value={value}
        onChange={(e) => onValue(e.target.value)}
        className={cls}
      >
        <option value="">Choose…</option>
        {field.values.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>
    );
  if (field.kind === "date")
    return (
      <input
        id={id}
        type="date"
        value={value}
        onChange={(e) => onValue(e.target.value)}
        className={cls}
      />
    );
  return (
    <span className="flex items-center gap-1.5">
      {field.kind === "money" && <span aria-hidden="true">$</span>}
      <input
        id={id}
        inputMode="decimal"
        value={value}
        onChange={(e) => onValue(e.target.value)}
        className={cn(cls, "num w-28")}
      />
      {field.units.length > 0 && (
        <select
          aria-label="Unit"
          value={unit ?? field.units[0]}
          onChange={(e) => onUnit(e.target.value as Unit)}
          className={cls}
        >
          {field.units.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
      )}
    </span>
  );
}

function EditTarget({
  rule,
  field,
  text,
  onSave,
}: {
  rule: Requirement;
  field: FieldOption;
  text: string;
  onSave: (r: Requirement) => void;
}) {
  const id = useId();
  const start = targetInput(rule);
  const [value, setValue] = useState(start.value);
  const [unit, setUnit] = useState<Unit | undefined>(start.unit);
  const [error, setError] = useState<string | null>(null);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const r = retarget(rule, field, value, unit);
    if (r.ok) onSave(r.requirement);
    else setError(r.error);
  };
  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2 pl-5">
      <label htmlFor={id} className="flex flex-col gap-1 text-small">
        New value for {text}
        <ValueInput
          field={field}
          value={value}
          unit={unit}
          onValue={setValue}
          onUnit={setUnit}
          id={id}
        />
      </label>
      <Button type="submit" variant="outline" className="min-h-10 px-3 py-1">
        Save
      </Button>
      {error && (
        <p role="alert" className="w-full text-red-pen text-small">
          {error}
        </p>
      )}
    </form>
  );
}

function RuleBuilder({
  options,
  existing,
  onAdd,
}: {
  options: FieldOption[];
  existing: string[];
  onAdd: (r: Requirement) => void;
}) {
  const id = useId();
  const [fieldName, setFieldName] = useState(options[0]?.field ?? "");
  const field = options.find((o) => o.field === fieldName) ?? options[0];
  const ops = field ? opsFor(field.kind) : [];
  const [op, setOp] = useState<Operator>(ops[0] ?? "lte");
  const [value, setValue] = useState("");
  const [unit, setUnit] = useState<Unit | undefined>(undefined);
  const [importance, setImportance] = useState<Importance>("hard");
  const [error, setError] = useState<string | null>(null);
  if (!field) return null;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const base = `u_${field.field.replace(/[^a-z0-9]+/g, "_")}`.slice(0, 56);
    let n = 1;
    let rid = base;
    while (existing.includes(rid)) rid = `${base}_${++n}`;
    const r = manualRule({
      id: rid,
      field,
      op: ops.includes(op) ? op : (ops[0] ?? "eq"),
      value,
      unit,
      importance,
    });
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setError(null);
    setValue("");
    onAdd(r.requirement);
  };
  const groupsByRole = new Map<string, FieldOption[]>();
  for (const o of options) {
    const key = o.role
      ? o.role
      : o.scope === "order"
        ? "Order"
        : "Whole basket";
    groupsByRole.set(key, [...(groupsByRole.get(key) ?? []), o]);
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-3 pt-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-small">
          Field
          <select
            value={field.field}
            onChange={(e) => {
              setFieldName(e.target.value);
              setValue("");
              setUnit(undefined);
              const next = options.find((o) => o.field === e.target.value);
              if (next) setOp(opsFor(next.kind)[0] ?? "eq");
            }}
            className="h-10 rounded-card border border-rule bg-paper-sheet px-2.5 text-graphite"
          >
            {[...groupsByRole].map(([group, opts]) => (
              <optgroup
                key={group}
                label={group.charAt(0).toUpperCase() + group.slice(1)}
              >
                {opts.map((o) => (
                  <option key={o.field} value={o.field}>
                    {o.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-small">
          Rule
          <select
            value={ops.includes(op) ? op : ops[0]}
            onChange={(e) => setOp(e.target.value as Operator)}
            className="h-10 rounded-card border border-rule bg-paper-sheet px-2.5 text-graphite"
          >
            {ops.map((o) => (
              <option key={o} value={o}>
                {field.kind === "date" && o === "lte"
                  ? "by"
                  : (OP_LABEL[o] ?? o)}
              </option>
            ))}
          </select>
        </label>
        <label
          htmlFor={`${id}-value`}
          className="flex flex-col gap-1 text-small"
        >
          Value
          <ValueInput
            field={field}
            value={value}
            unit={unit}
            onValue={setValue}
            onUnit={setUnit}
            id={`${id}-value`}
          />
        </label>
        <StrengthToggle
          value={importance}
          label="the new rule"
          onChange={setImportance}
        />
      </div>
      {error && (
        <p role="alert" className="text-red-pen text-small">
          {error}
        </p>
      )}
      <Button type="submit" variant="outline" className="w-fit">
        <Plus size={15} aria-hidden="true" /> Add rule
      </Button>
    </form>
  );
}
