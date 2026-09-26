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
  scope: "item" | "basket" | "order";
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
};

export const OP_LABEL: Partial<Record<Operator, string>> = {
  lte: "at most (≤)",
  gte: "at least (≥)",
  eq: "exactly",
  neq: "anything but",
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

/** Fields the form offers for these packs: item fields by role, then basket and order. */
export function fieldOptions(packs: readonly Pack[]): FieldOption[] {
  const out: FieldOption[] = [];
  const unitsFor = (def: FieldDef): Unit[] =>
    (Object.keys(UNIT_DIMENSION) as Unit[]).filter(
      (u) => UNIT_DIMENSION[u] === def.kind,
    );
  for (const pack of packs) {
    for (const [field, def] of Object.entries(pack.fields)) {
      if (field.endsWith(".*") || def.kind === "subjective") continue;
      if (def.kind === "text" || def.kind === "list") continue;
      const role = field.split(".")[0] ?? null;
      if (!pack.roles.some((r) => r.role === role)) continue;
      out.push({
        field,
        label: def.label,
        kind: def.kind,
        role,
        scope: "item",
        units: unitsFor(def),
        values: def.values ?? [],
      });
    }
  }
  for (const field of CORE_CHOICES) {
    const def = CORE_FIELDS[field];
    if (!def) continue;
    out.push({
      field,
      label: def.label,
      kind: def.kind,
      role: null,
      scope: field.startsWith("order.") ? "order" : "basket",
      units: unitsFor(def),
      values: def.values ?? [],
    });
  }
  return out;
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
