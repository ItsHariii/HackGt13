import { formatDate, formatMoneyText } from "@cartel/proof-engine";
import {
  type ConflictSet,
  type Plan,
  type SolverProblem,
  solvePlans,
  type TradeoffTerm,
} from "@cartel/solver";

/*
 * The compare screen (TASKS T11.5): plans from the solver, rows by
 * requirement. Item-level hard rules are settled before solving (the solver
 * only sees candidates that pass them), so their cells say so; basket rules
 * are read from each plan's totals; preferences from the solver's scores.
 * When no plan fits, the solver's minimal conflict set becomes the banner,
 * one relax action per member.
 */

export type CompareCell = {
  status: "pass" | "fail" | "pref-met" | "pref-unmet";
  text: string;
};

export type CompareRow = {
  id: string;
  rule: string;
  kind: "hard" | "preference";
  cells: CompareCell[];
};

export type ComparePlan = {
  /** The solver's label ("A"), as the workspace's `?plan=` takes it. */
  id: string;
  label: string;
  total: string;
  items: { role: string; title: string; price: string }[];
  delivery: string;
  tradeoff: string;
};

export type RelaxAction = {
  label: string;
  /** Query string that applies the relaxation. */
  query: Record<string, string>;
};

export type CompareView =
  | { status: "ok"; plans: ComparePlan[]; rows: CompareRow[] }
  | {
      status: "conflict";
      message: string;
      actions: RelaxAction[];
      emptyRoles: string[];
    };

export type CompareOptions = {
  /** Overrides the budget, in whole dollars. */
  budget?: number | undefined;
  /** Overrides the delivery deadline, ISO date. */
  by?: string | undefined;
};

const money = (m: number) => formatMoneyText(m, "USD");

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
/** "Wednesday" for an ISO date (UTC). */
export const weekday = (iso: string) =>
  WEEKDAYS[new Date(`${iso}T00:00:00Z`).getUTCDay()] ?? iso;

function titleFor(id: string, titles: Record<string, string>): string {
  return (
    titles[id] ??
    id
      .replace(/^dm_/, "")
      .split("_")
      .map((w) => (/^\d/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
      .join(" ")
  );
}

export function tradeoffText(
  t: Plan["tradeoff"],
  prefs: Record<string, string>,
): string {
  if (!t) return "Best overall";
  const term = (x: TradeoffTerm | null, gain: boolean) => {
    if (!x) return null;
    if (x.kind === "cost")
      return gain
        ? `saves ${money(x.savesMinor)}`
        : `costs ${money(-x.savesMinor)} more`;
    if (x.kind === "merchants")
      return gain ? `${x.fewer} fewer stores` : `${-x.fewer} more stores`;
    const name = prefs[x.preferenceId] ?? x.preferenceId;
    return gain ? `better on ${name}` : `gives up ${name}`;
  };
  const parts = [term(t.gain, true), term(t.loss, false)].filter(Boolean);
  const text = parts.join(", ");
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "Same as Plan A";
}

export type CompareContext = {
  titles: Record<string, string>;
  roleLabels: Record<string, string>;
  /** Hard item rules settled before solving, in display text. */
  itemRules: { id: string; text: string }[];
  preferences: Record<string, string>;
};

export async function buildCompare(
  base: SolverProblem,
  context: CompareContext,
  options: CompareOptions = {},
): Promise<CompareView> {
  const limits = { ...base.limits };
  if (options.budget !== undefined && limits.budget)
    limits.budget = {
      ...limits.budget,
      maxTotalMinor: Math.round(options.budget * 100),
    };
  if (options.by && limits.delivery)
    limits.delivery = { ...limits.delivery, by: options.by };
  const problem: SolverProblem = { ...base, limits };
  const result = await solvePlans(problem, { k: 3, engine: "exhaustive" });
  if (result.status === "infeasible")
    return conflictView(result.conflict, limits, context.roleLabels);

  const plans = result.plans;
  const price = new Map(base.candidates.map((c) => [c.id, c.unitPriceMinor]));
  const rows: CompareRow[] = [];
  if (limits.budget) {
    const max = limits.budget.maxTotalMinor;
    rows.push({
      id: limits.budget.requirementId,
      rule: `Delivered total ≤ ${money(max).replace(/\.00$/, "")}`,
      kind: "hard",
      cells: plans.map((p) => ({
        status: p.totals.totalMinor <= max ? "pass" : "fail",
        text: money(p.totals.totalMinor),
      })),
    });
  }
  if (limits.delivery) {
    const by = limits.delivery.by;
    rows.push({
      id: limits.delivery.requirementId,
      rule: `Latest delivery by ${formatDate(by)}`,
      kind: "hard",
      cells: plans.map((p) => ({
        status: p.deliveryLatest && p.deliveryLatest <= by ? "pass" : "fail",
        text: p.deliveryLatest ? formatDate(p.deliveryLatest) : "Unknown",
      })),
    });
  }
  for (const rule of context.itemRules)
    rows.push({
      id: rule.id,
      rule: rule.text,
      kind: "hard",
      cells: plans.map(() => ({
        status: "pass",
        text: "Checked before solving",
      })),
    });
  for (const [id, name] of Object.entries(context.preferences))
    rows.push({
      id,
      rule: name,
      kind: "preference",
      cells: plans.map((p) =>
        (p.preferenceScores[id] ?? 0) > 0
          ? { status: "pref-met", text: "Met" }
          : { status: "pref-unmet", text: "Not met" },
      ),
    });

  return {
    status: "ok",
    rows,
    plans: plans.map((p) => ({
      id: p.label,
      label: `Plan ${p.label}`,
      total: money(p.totals.totalMinor),
      delivery: p.deliveryLatest ? formatDate(p.deliveryLatest) : "Unknown",
      tradeoff: tradeoffText(p.tradeoff, context.preferences),
      items: p.lines.map((l) => ({
        role: context.roleLabels[l.role] ?? l.role,
        title: titleFor(l.offerId, context.titles),
        price: money((price.get(l.offerId) ?? 0) * l.qty),
      })),
    })),
  };
}

export function conflictView(
  conflict: ConflictSet,
  limits: NonNullable<SolverProblem["limits"]>,
  roleLabels: Record<string, string>,
): CompareView {
  const names = conflict.members.map((m) =>
    m.limit === "budget" && limits.budget
      ? `budget ≤ ${money(limits.budget.maxTotalMinor).replace(/\.00$/, "")}`
      : m.limit === "delivery" && limits.delivery
        ? `delivery by ${formatDate(limits.delivery.by)}`
        : "the store limit",
  );
  const actions: RelaxAction[] = conflict.members.flatMap(
    (m): RelaxAction[] => {
      const r = m.relaxation;
      if (!r) return [];
      if (r.kind === "budget")
        return [
          {
            label: `Raise budget +${money(r.deltaMinor)}`,
            query: { budget: String(Math.ceil(r.toMinor / 100)) },
          },
        ];
      if (r.kind === "delivery")
        return [
          {
            label: `Arrive ${weekday(r.to)}`,
            query: { by: r.to },
          },
        ];
      return [];
    },
  );
  const empty = conflict.emptyRoles.map((r) => roleLabels[r] ?? r);
  return {
    status: "conflict",
    emptyRoles: empty,
    actions,
    message: empty.length
      ? `No product passes the item rules for: ${empty.join(", ")}. Relaxing the budget or date won't help; change those rules.`
      : `No plan meets every hard rule. The conflict is ${names.join(" + ")}.${actions.length ? ` Relax one: ${actions.map((a) => a.label.toLowerCase()).join(", or ")}.` : ""}`,
  };
}
