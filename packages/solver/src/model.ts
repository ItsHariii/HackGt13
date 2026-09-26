import type { Cut } from "./evaluate";
import { diversityBound } from "./evaluate";
import type { Compiled } from "./problem";
import { deliverable } from "./problem";
import type { BasketLimits } from "./types";

/*
 * The MILP of SDD §9.1 in CPLEX LP text, which HiGHS reads directly.
 *
 *   x_i ∈ {0,1}   candidate i is picked for its role
 *   m_k ∈ {0,1}   merchant k is used
 *   t   ∈ ℤ≥0     tax in minor units
 *
 *   max  Σ (prefValue_i − λ·line_i)·x_i − Σ (λ·ship_k + μ)·m_k − λ·t
 *   s.t. Σ_{i∈r} x_i = 1 (required role) or ≤ 1 (optional role)
 *        x_i − m_{merchant(i)} ≤ 0
 *        x_a + x_b ≤ 1                          incompatible pairs
 *        Σ m_k ≤ maxMerchants
 *        t − rate·Σ line_i·x_i ≥ −0.5            tax, linearized
 *        Σ line_i·x_i + Σ ship_k·m_k + t ≤ budget
 *        no-good cuts (see `Cut`)
 *
 * A role picks one offer and buys it `qty` times, so `line_i` is price ×
 * qty. The tax row lets t round half down; the exact half-even total is
 * checked afterwards and a basket that breaks the budget by that cent is
 * cut and re-solved. Candidates that miss the delivery date are left out of
 * the model entirely.
 */

export interface LpModel {
  text: string;
  /** Candidate index per `x` column, in column order. */
  columns: number[];
}

const TERMS_PER_LINE = 8;

/** Plain decimal text: LP readers differ on exponents, so never emit one. */
function num(n: number): string {
  if (!Number.isFinite(n)) throw new RangeError(`non-finite coefficient ${n}`);
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(12).replace(/0+$/, "").replace(/\.$/, "");
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size)
    out.push(items.slice(i, i + size));
  return out;
}

function linear(terms: ReadonlyArray<readonly [number, string]>): string {
  const parts = terms.map(([c, v], i) => {
    const body = `${num(Math.abs(c))} ${v}`;
    if (i === 0) return c < 0 ? `- ${body}` : body;
    return `${c < 0 ? "-" : "+"} ${body}`;
  });
  return chunk(parts, TERMS_PER_LINE)
    .map((l) => l.join(" "))
    .join("\n   ");
}

/**
 * Builds the model, or returns null when a required role has no candidate
 * that can arrive in time (trivially infeasible, nothing to solve).
 */
export function buildModel(
  p: Compiled,
  limits: BasketLimits,
  cuts: readonly Cut[] = [],
): LpModel | null {
  const inModel = p.candidates.map((c) => deliverable(c, limits));
  const x = (i: number) => `x${i}`;
  const m = (k: number) => `m${k}`;
  const columns = p.candidates.flatMap((_, i) => (inModel[i] ? [i] : []));
  const hasTax = p.taxRateBps > 0;
  const rate = p.taxRateBps / 10_000;

  const rows: string[] = [];
  const row = (
    name: string,
    terms: [number, string][],
    rel: string,
    rhs: number,
  ) => {
    rows.push(` ${name}: ${linear(terms)} ${rel} ${num(rhs)}`);
  };

  for (const [r, role] of p.roles.entries()) {
    const picks = role.candidates.filter((i) => inModel[i]);
    if (picks.length === 0) {
      if (role.optional) continue;
      return null;
    }
    row(
      `role${r}`,
      picks.map((i) => [1, x(i)]),
      role.optional ? "<=" : "=",
      1,
    );
  }

  const usedMerchants = new Set<number>();
  for (const i of columns) {
    const k = p.candidates[i]?.merchant ?? -1;
    usedMerchants.add(k);
    row(
      `link${i}`,
      [
        [1, x(i)],
        [-1, m(k)],
      ],
      "<=",
      0,
    );
  }
  const merchantCols = [...usedMerchants].sort((a, b) => a - b);

  for (const [n, [a, b]] of p.incompatible.entries()) {
    if (inModel[a] && inModel[b])
      row(
        `pair${n}`,
        [
          [1, x(a)],
          [1, x(b)],
        ],
        "<=",
        1,
      );
  }

  if (limits.maxMerchants && merchantCols.length > 0) {
    row(
      "merchants",
      merchantCols.map((k) => [1, m(k)]),
      "<=",
      limits.maxMerchants.max,
    );
  }

  const line = (i: number) => p.candidates[i]?.lineMinor ?? 0;
  if (hasTax && columns.length > 0) {
    row(
      "tax",
      [
        [1, "t"],
        ...columns.map((i): [number, string] => [-rate * line(i), x(i)]),
      ],
      ">=",
      -0.5,
    );
  }

  if (limits.budget) {
    const terms: [number, string][] = [
      ...columns.map((i): [number, string] => [line(i), x(i)]),
      ...merchantCols.map((k): [number, string] => [
        p.merchants[k]?.shippingMinor ?? 0,
        m(k),
      ]),
    ];
    if (hasTax) terms.push([1, "t"]);
    if (terms.length > 0)
      row("budget", terms, "<=", limits.budget.maxTotalMinor);
  }

  for (const [n, cut] of cuts.entries()) {
    const kept = cut.sel.filter((i) => inModel[i]);
    if (cut.kind === "exclude") {
      // A cut against a basket that is no longer representable is moot.
      if (kept.length !== cut.sel.length) continue;
      const inS = new Set(cut.sel);
      const terms = columns.map((i): [number, string] => [
        inS.has(i) ? 1 : -1,
        x(i),
      ]);
      if (terms.length > 0) row(`cut${n}`, terms, "<=", cut.sel.length - 1);
    } else if (cut.sel.length === 0) {
      if (columns.length === 0) return null;
      row(
        `cut${n}`,
        columns.map((i) => [1, x(i)]),
        ">=",
        1,
      );
    } else if (kept.length > 0) {
      row(
        `cut${n}`,
        kept.map((i) => [1, x(i)]),
        "<=",
        diversityBound(cut.sel),
      );
    }
  }

  const objective: [number, string][] = [
    ...columns.map((i): [number, string] => {
      const c = p.candidates[i];
      return [(c?.prefValue ?? 0) - p.costPerMinor * line(i), x(i)];
    }),
    ...merchantCols.map((k): [number, string] => [
      -(p.costPerMinor * (p.merchants[k]?.shippingMinor ?? 0) + p.perMerchant),
      m(k),
    ]),
  ];
  if (hasTax) objective.push([-p.costPerMinor, "t"]);
  // An empty objective or constraint block is not valid LP; anchor it on a dummy.
  if (objective.length === 0) objective.push([0, "dummy"]);
  if (rows.length === 0) row("anchor", [[1, "dummy"]], "<=", 0);

  const binaries = [...columns.map(x), ...merchantCols.map(m)];
  const text = [
    "Maximize",
    ` obj: ${linear(objective)}`,
    "Subject To",
    ...rows,
    "Bounds",
    hasTax ? " t >= 0" : "",
    " 0 <= dummy <= 0",
    ...(hasTax ? ["General", " t"] : []),
    ...(binaries.length > 0
      ? ["Binary", ...chunk(binaries, 16).map((c) => ` ${c.join(" ")}`)]
      : []),
    "End",
  ]
    .filter((l) => l !== "")
    .join("\n");
  return { text, columns };
}
