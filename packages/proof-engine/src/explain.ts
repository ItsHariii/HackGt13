import {
  type EvidenceState,
  evidenceLabel,
  type Operator,
  type ProofResult,
  type Qualifier,
  toMajor,
  type Value,
} from "@proofcart/contracts";
import type { FieldDef } from "./fields";
import {
  isBox,
  isIsoDate,
  isMoney,
  isQuantity,
  isRange,
  isStringList,
} from "./values";

/*
 * Explanation templates (SDD §8.1): reason code → sentence, with values
 * interpolated from the result. The text is computed here, deterministically;
 * a model may rephrase it for tone but never decides it. Wording follows
 * SDD §17.3: claims are attributed, "Confirmed" appears only for verified
 * facts (via `evidenceLabel`), unknowns are said plainly, and nothing
 * promises a guarantee.
 */

const UNIT_TEXT: Record<string, string> = {
  in: " in",
  mm: " mm",
  cm: " cm",
  m: " m",
  ft: " ft",
  g: " g",
  kg: " kg",
  oz: " oz",
  lb: " lb",
  W: " W",
  Wh: " Wh",
  mAh: " mAh",
  ml: " ml",
  l: " L",
  fl_oz: " fl oz",
  V: " V",
  pct: "%",
  day: " days",
  count: "",
};

const QUALIFIER_TEXT: Record<Qualifier, string> = {
  up_to: "up to ",
  approx: "about ",
  max: "at most ",
  min: "at least ",
};

const CURRENCY_SYMBOL: Record<string, string> = {
  USD: "$",
  EUR: "€",
  GBP: "£",
  CAD: "CA$",
  AUD: "A$",
};

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function formatNumber(n: number): string {
  const [int = "0", frac] = String(Math.round(n * 100) / 100).split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return frac ? `${grouped}.${frac}` : grouped;
}

export function formatMoneyText(amountMinor: number, currency: string): string {
  const major = toMajor(amountMinor, currency);
  const [int = "0", frac = ""] = Math.abs(major)
    .toFixed(currency === "JPY" ? 0 : 2)
    .split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const body = frac ? `${grouped}.${frac}` : grouped;
  const sign = major < 0 ? "−" : "";
  const symbol = CURRENCY_SYMBOL[currency];
  return symbol ? `${sign}${symbol}${body}` : `${sign}${body} ${currency}`;
}

/** "Mon Sep 28" for a date; the engine has no locale or clock, so this is fixed English, UTC. */
export function formatDate(iso: string): string {
  const ms = Date.parse(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  const d = new Date(ms);
  return `${WEEKDAY[d.getUTCDay()]} ${MONTH[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/** Human text for any `Value`: `up to 90 W`, `$896.05`, `21.5 × 14 × 9 in`, `Mon Sep 28`. */
export function formatValue(v: Value | null, def?: FieldDef): string {
  if (v === null) return "nothing";
  if (isQuantity(v)) {
    const q = v.qualifier ? QUALIFIER_TEXT[v.qualifier] : "";
    const unit =
      v.unit === "day" && v.value === 1
        ? " day"
        : (UNIT_TEXT[v.unit] ?? ` ${v.unit}`);
    return `${q}${formatNumber(v.value)}${unit}`;
  }
  if (isMoney(v)) return formatMoneyText(v.amountMinor, v.currency);
  if (isBox(v))
    return `${v.dims.map(formatNumber).join(" × ")}${UNIT_TEXT[v.unit] ?? ` ${v.unit}`}`;
  if (isRange(v)) {
    return `${formatValue(v.min as Value, def)} to ${formatValue(v.max as Value, def)}`;
  }
  if (isStringList(v)) return v.length === 0 ? "none" : v.join(", ");
  if (isIsoDate(v)) return formatDate(v);
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (typeof v === "number") return formatNumber(v);
  return v;
}

const OP_TEXT: Record<Operator, (target: string) => string> = {
  eq: (t) => t,
  neq: (t) => `anything but ${t}`,
  gte: (t) => `at least ${t}`,
  lte: (t) => `at most ${t}`,
  between: (t) => `between ${t}`,
  in: (t) => `one of ${t}`,
  not_in: (t) => `none of ${t}`,
  contains: (t) => `including ${t}`,
  excludes: (t) => `without ${t}`,
  before: (t) => `before ${t}`,
  compatible_with: () => "compatible",
  exists: () => "stated",
};

/** "at least 65 W", "at most 48 in", "before Mon Sep 28". */
export function formatTarget(
  op: Operator,
  target: Value,
  def?: FieldDef,
): string {
  if (op === "between" && isRange(target)) {
    return `between ${formatValue(target.min as Value, def)} and ${formatValue(target.max as Value, def)}`;
  }
  if (op === "eq" && typeof target === "boolean") return target ? "yes" : "no";
  return OP_TEXT[op](formatValue(target, def));
}

export type ExplainOptions = {
  /** The field's definition, for its label. Falls back to the field path. */
  def?: FieldDef | undefined;
  /** Display name of the source behind the fact: "Manufacturer", "DemoMart checkout". */
  source?: string | undefined;
  /** Seconds since the fact was fetched, for "Confirmed · … · 4 min ago". */
  ageSeconds?: number | null | undefined;
  /** The requirement's minimum state, for "insufficient evidence" explanations. */
  minStateToPass?: EvidenceState | undefined;
  field?: string | undefined;
};

const STATE_NOUN: Record<EvidenceState, string> = {
  verified: "a confirmed value",
  source_stated: "a source's own claim",
  supported: "indirect evidence",
  estimated: "an estimate",
  unknown: "nothing usable",
};

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * One sentence for a result. Examples:
 * - `USB-C power: Manufacturer says up to 90 W, which meets at least 65 W.`
 * - `USB-C power: Manufacturer says 15 W, which doesn't meet at least 65 W.`
 * - `Chair comfort is subjective, so it can't be checked.`
 */
export function explain(
  result: ProofResult,
  opts: ExplainOptions = {},
): string {
  const label = opts.def?.label ?? opts.field ?? result.requirementId;
  const observed = formatValue(result.observed, opts.def);
  const target = formatTarget(result.target.op, result.target.value, opts.def);
  const attributed = () => {
    switch (result.evidenceState) {
      case "unknown":
        return observed;
      case "supported":
        return `evidence suggests ${observed}`;
      case "estimated":
        return `${observed} (estimate)`;
      default: {
        const badge = evidenceLabel(
          result.evidenceState,
          opts.source ?? "The source",
          opts.ageSeconds ?? null,
        );
        return badge.endsWith(" says")
          ? `${badge} ${observed}`
          : `${observed} (${badge})`;
      }
    }
  };

  if (result.verdict === "pass") {
    if (result.target.op === "exists") return `${label}: ${attributed()}.`;
    if (result.target.op === "compatible_with") {
      return `${label}: compatible, based on ${STATE_NOUN[result.evidenceState]}.`;
    }
    return `${label}: ${attributed()}, which meets ${target}.`;
  }
  if (result.verdict === "fail") {
    if (result.target.op === "compatible_with") {
      return `${label}: not compatible, based on ${STATE_NOUN[result.evidenceState]}.`;
    }
    return `${label}: ${attributed()}, which doesn't meet ${target}.`;
  }
  switch (result.reason) {
    case "insufficient_evidence":
      return `${label}: ${observed} would meet ${target}, but it rests on ${STATE_NOUN[result.evidenceState]}${
        opts.minStateToPass
          ? ` and this rule needs ${STATE_NOUN[opts.minStateToPass]}`
          : ""
      }.`;
    case "stale":
      return result.observed === null
        ? `${label}: the information is out of date.`
        : `${label}: the last reading (${observed}) is out of date.`;
    case "conflict":
      return `${label}: sources disagree, so it can't be checked.`;
    case "subjective":
      return `${capitalize(label)} is subjective, so it can't be checked.`;
    case "role_missing": {
      const role = result.scope.kind === "item" ? result.scope.role : "item";
      return `Nothing is chosen for the ${role.replace(/_/g, " ")} yet.`;
    }
    case "total_mismatch":
      return `${label}: the store's total doesn't match the line items (${observed} computed).`;
    case "incomparable":
      return `${label}: ${observed} can't be compared with ${target}.`;
    default:
      return `${label}: no source states this.`;
  }
}
