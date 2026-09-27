import {
  type Importance,
  type Operator,
  Requirement,
  UNIT_DIMENSION,
  type Unit,
  type Value,
} from "@cartel/contracts";
import { CORE_FIELDS, type FieldDef, type Pack } from "@cartel/proof-engine";

/*
 * The manual rule builder (TASKS T11.2, the "AI off" path): a field, an
 * operator, a value and a strength become a Requirement with
 * `user_selected` provenance. Everything here is deterministic; the form
 * never needs the AI layer.
 */

export type FieldOption = {
  field: string;
  label: string;
  kind: FieldDef["kind"];
  /** The role an item field belongs to (`desk` for `desk.width`). */
  role: string | null;
  scope: "item" | "basket" | "merchant" | "order";
  units: Unit[];
  values: readonly string[];
};

const ITEM_OPS: Operator[] = ["lte", "gte", "eq"];
const OPS_BY_KIND: Partial<Record<FieldDef["kind"], Operator[]>> = {
  boolean: ["eq"],
  enum: ["eq", "neq"],
  date: ["lte"],
  money: ["lte", "gte"],
  count: ["lte", "gte", "eq"],
  list: ["excludes", "contains"],
};

export const OP_LABEL: Partial<Record<Operator, string>> = {
  lte: "at most (≤)",
  gte: "at least (≥)",
  eq: "exactly",
  neq: "anything but",
  excludes: "none of",
  contains: "includes",
};

/** Basket and order fields people set by hand; the rest are computed. */
const CORE_CHOICES = [
  "basket.delivered_total",
  "basket.delivery_latest",
  "basket.merchant_count",
  "order.substitutions_allowed",
];

export function opsFor(kind: FieldDef["kind"]): Operator[] {
  return OPS_BY_KIND[kind] ?? ITEM_OPS;
}

function unitsFor(def: FieldDef): Unit[] {
  return (Object.keys(UNIT_DIMENSION) as Unit[]).filter(
    (u) => UNIT_DIMENSION[u] === def.kind,
  );
}

function optionFor(
  field: string,
  def: FieldDef,
  role: string | null,
): FieldOption {
  const prefix = field.split(".")[0];
  return {
    field,
    label: def.label,
    kind: def.kind,
    role,
    scope:
      prefix === "basket" || prefix === "merchant" || prefix === "order"
        ? prefix
        : "item",
    units: unitsFor(def),
    values: def.values ?? [],
  };
}

/** A field people can type a value for: not computed, free text or taste. */
function settable(field: string, def: FieldDef): boolean {
  return (
    !field.endsWith(".*") &&
    def.kind !== "subjective" &&
    def.kind !== "text" &&
    field !== "basket.missing_roles"
  );
}

/** Fields the form offers for these packs: item fields by role, then basket and order. */
export function fieldOptions(packs: readonly Pack[]): FieldOption[] {
  const out: FieldOption[] = [];
  for (const pack of packs) {
    for (const [field, def] of Object.entries(pack.fields)) {
      if (!settable(field, def)) continue;
      const role = field.split(".")[0] ?? null;
      if (!pack.roles.some((r) => r.role === role)) continue;
      out.push(optionFor(field, def, role));
    }
  }
  for (const field of CORE_CHOICES) {
    const def = CORE_FIELDS[field];
    if (def) out.push(optionFor(field, def, null));
  }
  return out;
}

/**
 * Any settable field a rule or a question can name, including core `offer.*`
 * fields the form doesn't list. `role` is the item an `offer.*` rule is about.
 */
export function fieldOption(
  field: string,
  packs: readonly Pack[],
  role?: string,
): FieldOption | undefined {
  const listed = fieldOptions(packs).find((o) => o.field === field);
  if (listed) return listed;
  const def =
    CORE_FIELDS[field] ?? packs.find((p) => p.fields[field])?.fields[field];
  if (!def || !settable(field, def)) return undefined;
  const option = optionFor(field, def, role ?? null);
  // An item rule needs a role; without one there is nothing to attach it to.
  return option.scope === "item" && !option.role ? undefined : option;
}

/** The operator a one-value answer means: "by" a date, "at most" an amount, "none of" a list. */
export function defaultOp(kind: FieldDef["kind"]): Operator {
  if (kind === "list") return "excludes";
  if (kind === "boolean" || kind === "enum") return "eq";
  return "lte";
}

export type ManualRuleInput = {
  id: string;
  field: FieldOption;
  op: Operator;
  /** What the person typed or picked. */
  value: string;
  unit?: Unit | undefined;
  importance: Importance;
  currency?: string;
};

export type ManualRuleResult =
  | { ok: true; requirement: Requirement }
  | { ok: false; error: string };

function parseTarget(input: ManualRuleInput): Value | string {
  const { field, value } = input;
  const raw = value.trim();
  switch (field.kind) {
    case "boolean":
      if (raw === "yes" || raw === "true") return true;
      if (raw === "no" || raw === "false") return false;
      return "Choose yes or no.";
    case "list": {
      const items = raw
        .split(",")
        .map((x) => x.trim().toLowerCase())
        .filter(Boolean);
      return items.length ? [...new Set(items)] : "List at least one item.";
    }
    case "enum":
      return field.values.includes(raw)
        ? raw
        : "Pick one of the listed values.";
    case "date":
      return /^\d{4}-\d{2}-\d{2}$/.test(raw) && !Number.isNaN(Date.parse(raw))
        ? raw
        : "Enter a date.";
    case "money": {
      const n = Number(raw.replace(/[$,]/g, ""));
      if (!raw || !Number.isFinite(n) || n < 0) return "Enter an amount.";
      return {
        amountMinor: Math.round(n * 100),
        currency: input.currency ?? "USD",
      };
    }
    default: {
      const n = Number(raw);
      if (!raw || !Number.isFinite(n) || n < 0) return "Enter a number.";
      const unit = input.unit ?? field.units[0];
      if (!unit) return "Pick a unit.";
      return { value: n, unit };
    }
  }
}

/** Builds and validates a hand-made rule. The same schema checks as any other rule apply. */
export function manualRule(input: ManualRuleInput): ManualRuleResult {
  const target = parseTarget(input);
  if (typeof target === "string" && !isValueString(input, target))
    return { ok: false, error: target };
  const { field } = input;
  const parsed = Requirement.safeParse({
    id: input.id,
    scope: field.scope,
    ...(field.role ? { role: field.role } : {}),
    field: field.field,
    op: input.op,
    target,
    importance: input.importance,
    ...(input.importance === "preference" ? { weight: 0.5 } : {}),
    evidence: {
      minStateToPass:
        field.kind === "date"
          ? "estimated"
          : field.scope === "item"
            ? "source_stated"
            : "verified",
    },
    materiality: field.scope === "item" ? "on_verdict_change" : "always",
    provenance: { kind: "user_selected", via: "form", label: field.label },
  });
  return parsed.success
    ? { ok: true, requirement: parsed.data }
    : { ok: false, error: "That rule isn't valid. Check the value." };
}

/** Enum values and ISO dates are valid string targets; anything else is an error message. */
function isValueString(input: ManualRuleInput, s: string): boolean {
  return (
    (input.field.kind === "enum" && input.field.values.includes(s)) ||
    (input.field.kind === "date" && /^\d{4}-\d{2}-\d{2}$/.test(s))
  );
}

/** The target as the edit form shows it: a value and, for quantities, a unit. */
export function targetInput(r: Requirement): { value: string; unit?: Unit } {
  const t = r.target;
  if (typeof t === "boolean") return { value: t ? "yes" : "no" };
  if (Array.isArray(t)) return { value: t.map(String).join(", ") };
  if (typeof t === "string" || typeof t === "number")
    return { value: String(t) };
  if (t && typeof t === "object" && !Array.isArray(t)) {
    if ("amountMinor" in t) return { value: String(t.amountMinor / 100) };
    if ("value" in t && "unit" in t)
      return { value: String(t.value), unit: t.unit as Unit };
  }
  return { value: "" };
}

/** A new target for an existing rule; its provenance and strength stay. */
export function retarget(
  r: Requirement,
  field: FieldOption,
  value: string,
  unit?: Unit,
): ManualRuleResult {
  const next = manualRule({
    id: r.id,
    field,
    op: r.op,
    value,
    unit,
    importance: r.importance,
  });
  if (!next.ok) return next;
  const parsed = Requirement.safeParse({
    ...r,
    target: next.requirement.target,
  });
  return parsed.success
    ? { ok: true, requirement: parsed.data }
    : { ok: false, error: "That value doesn't fit this rule." };
}

/** A fresh `u_…` id for a hand-made rule on this field. */
export function manualRuleId(field: string, existing: readonly string[]) {
  const base = `u_${field.replace(/[^a-z0-9]+/g, "_")}`.slice(0, 56);
  let id = base;
  for (let n = 2; existing.includes(id); n++) id = `${base}_${n}`;
  return id;
}

/** A rule already covering this field and operator, so a second one would only duplicate it. */
export function sameRule(
  rules: readonly Requirement[],
  candidate: Pick<Requirement, "field" | "op" | "role">,
): Requirement | undefined {
  return rules.find(
    (r) =>
      r.field === candidate.field &&
      r.op === candidate.op &&
      (r.role ?? null) === (candidate.role ?? null),
  );
}

/** The hard rule a one-value answer to a question sets on its field. */
export function answerRule(input: {
  field: FieldOption;
  value: string;
  unit?: Unit | undefined;
  rules: readonly Requirement[];
}): ManualRuleResult {
  return manualRule({
    id: manualRuleId(
      input.field.field,
      input.rules.map((r) => r.id),
    ),
    field: input.field,
    op: defaultOp(input.field.kind),
    value: input.value,
    unit: input.unit,
    importance: "hard",
  });
}
