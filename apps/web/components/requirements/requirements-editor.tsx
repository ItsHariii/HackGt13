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
  useId,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { saveRequirements } from "@/app/plans/[id]/requirements/actions";
import { RequirementChip } from "@/components/cartel/requirement-chip";
import { Button } from "@/components/ui/button";
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
  options: { label: string; rule: string }[];
};

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
  questions = [],
  mode,
}: {
  planId: string;
  brief: string;
  packIds: string[];
  initial: Requirement[];
  questions?: Question[];
  /** Demo plans keep edits in the page; stored plans save a new set. */
  mode: "demo" | "stored";
}) {
  const packs = useMemo(
    () => packIds.flatMap((p) => (PACKS[p] ? [PACKS[p]] : [])),
    [packIds],
  );
  const options = useMemo(() => fieldOptions(packs), [packs]);
  const [rules, setRules] = useState(initial);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [hover, setHover] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [builderOpen, setBuilderOpen] = useState(initial.length === 0);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, startSave] = useTransition();
  const builder = useRef<HTMLDetailsElement>(null);
  const changed = rules !== initial;

  const quoteSpan = (() => {
    const r = rules.find((x) => x.id === hover);
    return r?.provenance.kind === "user_stated" ? r.provenance.span : null;
  })();

  const update = (id: string, next: Requirement | null, message: string) => {
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
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex flex-col gap-8 pb-28">
        <Section
          title="You said"
          empty="Nothing yet. Add a rule by hand below."
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
            title="I assumed, confirm?"
            dashed
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
          <Section title="Needs your answer" count={openQuestions.length}>
            {questions.map((q) => (
              <li
                key={q.id}
                className="sheet flex flex-col gap-3 p-4 text-graphite"
              >
                <p className="font-semibold text-ui">{q.text}</p>
                <div
                  role="radiogroup"
                  aria-label={q.text}
                  className="grid gap-2 sm:grid-cols-2"
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
                        "flex flex-col items-start gap-1.5 rounded-card border p-3 text-left",
                        answers[q.id] === i
                          ? "border-graphite bg-paper-raised shadow-primary"
                          : "border-rule hover:border-graphite",
                      )}
                    >
                      <span className="font-semibold text-ui">{o.label}</span>
                      <code className="num rounded-[4px] bg-paper-shade px-1.5 py-0.5 text-ink text-small">
                        {o.rule}
                      </code>
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </Section>
        )}

        {groups.default.length > 0 && (
          <Section
            title="Defaults from the rule pack"
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
        <div className="sheet sticky top-6 flex flex-col gap-3 p-5 text-graphite">
          <h2 className="font-semibold text-meta text-muted uppercase tracking-label">
            Your brief
          </h2>
          <p className="font-serif text-[16.5px] text-graphite-2 leading-[1.65]">
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
          <p className="text-muted text-small">
            Hover or focus a “You said” rule to see the words it came from.
          </p>
        </div>
      </aside>

      <div className="fixed inset-x-0 bottom-0 z-10 border-graphite border-t bg-paper-raised">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center gap-x-5 gap-y-2 px-5 py-3 sm:px-8">
          <p className="num text-small">
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
            className="min-h-6 text-ink text-small underline underline-offset-4"
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
            <Button asChild>
              <Link href={`/plans/${planId}`}>
                Find plans <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </Button>
          ) : (
            <Button
              type="button"
              onClick={findPlans}
              disabled={saving || rules.length === 0}
            >
              {saving ? "Saving rules…" : "Find plans"}
              <ArrowRight size={16} aria-hidden="true" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  count,
  dashed = false,
  empty,
  children,
}: {
  title: string;
  count: number;
  dashed?: boolean;
  empty?: string;
  children: React.ReactNode;
}) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h2
        id={id}
        className="flex items-center gap-2 border-graphite border-b pb-2 font-bold text-meta uppercase tracking-label"
      >
        {title}
        <span className="num font-normal text-muted">{count}</span>
      </h2>
      {count === 0 && empty ? (
        <p className="text-muted text-small">{empty}</p>
      ) : (
        <ul className={cn("flex flex-col gap-2.5", dashed && "")}>
          {children}
        </ul>
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
        "flex flex-col gap-2.5 rounded-card border bg-paper-raised px-4 py-3 text-graphite",
        assumed ? "border-pencil border-dashed" : "border-rule",
      )}
    >
      <div className="flex flex-wrap items-start gap-3">
        <span
          aria-hidden="true"
          className={cn(
            "mt-1.5 size-2.5 shrink-0",
            assumed ? "border border-pencil border-dashed" : "bg-ink",
          )}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span
            className={cn(
              "font-semibold text-[15.5px]",
              assumed ? "text-muted" : "text-ink",
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
            {quote && <span>From your brief: “{quote}”</span>}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {field && (
            <button
              type="button"
              onClick={onEdit}
              aria-expanded={editing}
              aria-label={`Edit ${text}`}
              className="inline-flex size-9 items-center justify-center rounded-card border border-rule hover:border-graphite"
            >
              <Pencil size={14} aria-hidden="true" />
            </button>
          )}
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${text}`}
            className="inline-flex size-9 items-center justify-center rounded-card border border-rule hover:border-red-pen hover:text-red-pen"
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
      className="flex w-fit rounded-card border border-rule p-0.5 text-small"
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
            "h-8 rounded-[6px] px-3 font-semibold",
            value === v ? "bg-graphite text-paper-raised" : "text-graphite",
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
