import type { BasketLimits, SolverProblem } from "./types";

export class SolverInputError extends Error {
  override name = "SolverInputError";
}

export const DEFAULT_COST_PER_DOLLAR = 0.002;
export const DEFAULT_PER_MERCHANT = 0.05;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A candidate with its references resolved to indexes. */
export interface IndexedCandidate {
  id: string;
  role: number;
  merchant: number;
  /** Unit price × role quantity. */
  lineMinor: number;
  deliveryBy: string | null;
  /** Σ w_pref · score: this candidate's contribution to the objective. */
  prefValue: number;
}

/**
 * The validated, index-based form both engines work on. Built once per
 * solve; limits are passed separately so the conflict analysis can vary
 * them without recompiling.
 */
export interface Compiled {
  source: SolverProblem;
  roles: { id: string; qty: number; optional: boolean; candidates: number[] }[];
  merchants: { id: string; shippingMinor: number }[];
  candidates: IndexedCandidate[];
  /** Incompatible candidate index pairs. */
  incompatible: [number, number][];
  taxRateBps: number;
  costPerMinor: number;
  perMerchant: number;
}

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new SolverInputError(message);
}

function isMinor(n: number): boolean {
  return Number.isSafeInteger(n) && n >= 0;
}

export function compile(problem: SolverProblem): Compiled {
  assert(/^[A-Z]{3}$/.test(problem.currency), "currency must be ISO 4217");
  assert(
    Number.isInteger(problem.taxRateBps) &&
      problem.taxRateBps >= 0 &&
      problem.taxRateBps <= 10_000,
    "taxRateBps must be an integer in [0, 10000]",
  );

  const roleIndex = new Map<string, number>();
  const roles = problem.roles.map((r, i) => {
    assert(!roleIndex.has(r.id), `duplicate role ${r.id}`);
    roleIndex.set(r.id, i);
    const qty = r.qty ?? 1;
    assert(Number.isSafeInteger(qty) && qty >= 1, `role ${r.id}: bad qty`);
    return {
      id: r.id,
      qty,
      optional: r.optional ?? false,
      candidates: [] as number[],
    };
  });

  const merchantIndex = new Map<string, number>();
  const merchants = problem.merchants.map((m, i) => {
    assert(!merchantIndex.has(m.id), `duplicate merchant ${m.id}`);
    assert(isMinor(m.shippingMinor), `merchant ${m.id}: bad shipping`);
    merchantIndex.set(m.id, i);
    return { id: m.id, shippingMinor: m.shippingMinor };
  });

  const weights = problem.preferenceWeights ?? {};
  for (const [id, w] of Object.entries(weights)) {
    assert(
      Number.isFinite(w) && w >= 0 && w <= 1,
      `weight ${id} not in [0, 1]`,
    );
  }

  const candidateIndex = new Map<string, number>();
  const candidates = problem.candidates.map((c, i): IndexedCandidate => {
    assert(!candidateIndex.has(c.id), `duplicate candidate ${c.id}`);
    candidateIndex.set(c.id, i);
    const role = roleIndex.get(c.role);
    const merchant = merchantIndex.get(c.merchant);
    assert(role !== undefined, `candidate ${c.id}: unknown role ${c.role}`);
    assert(
      merchant !== undefined,
      `candidate ${c.id}: unknown merchant ${c.merchant}`,
    );
    assert(isMinor(c.unitPriceMinor), `candidate ${c.id}: bad price`);
    assert(
      c.deliveryBy === undefined || ISO_DATE.test(c.deliveryBy),
      `candidate ${c.id}: deliveryBy must be YYYY-MM-DD`,
    );
    let prefValue = 0;
    for (const [id, score] of Object.entries(c.scores ?? {})) {
      assert(
        Number.isFinite(score) && score >= 0 && score <= 1,
        `candidate ${c.id}: score ${id} not in [0, 1]`,
      );
      prefValue += (weights[id] ?? 0) * score;
    }
    const lineMinor = c.unitPriceMinor * (roles[role]?.qty ?? 1);
    assert(
      Number.isSafeInteger(lineMinor),
      `candidate ${c.id}: line total overflows`,
    );
    roles[role]?.candidates.push(i);
    return {
      id: c.id,
      role,
      merchant,
      lineMinor,
      deliveryBy: c.deliveryBy ?? null,
      prefValue,
    };
  });

  const incompatible = (problem.incompatible ?? []).map(
    ([a, b]): [number, number] => {
      const ia = candidateIndex.get(a);
      const ib = candidateIndex.get(b);
      assert(
        ia !== undefined && ib !== undefined,
        `incompatible pair ${a}/${b}: unknown offer`,
      );
      assert(ia !== ib, `incompatible pair ${a}/${b}: same offer`);
      return [ia, ib];
    },
  );

  validateLimits(problem.limits ?? {});

  const costPerDollar =
    problem.objective?.costPerDollar ?? DEFAULT_COST_PER_DOLLAR;
  const perMerchant = problem.objective?.perMerchant ?? DEFAULT_PER_MERCHANT;
  assert(
    Number.isFinite(costPerDollar) && costPerDollar >= 0,
    "bad costPerDollar",
  );
  assert(Number.isFinite(perMerchant) && perMerchant >= 0, "bad perMerchant");

  return {
    source: problem,
    roles,
    merchants,
    candidates,
    incompatible,
    taxRateBps: problem.taxRateBps,
    costPerMinor: costPerDollar / 100,
    perMerchant,
  };
}

export function validateLimits(limits: BasketLimits): void {
  if (limits.budget) {
    assert(
      isMinor(limits.budget.maxTotalMinor),
      "budget must be a non-negative integer",
    );
  }
  if (limits.delivery) {
    assert(
      ISO_DATE.test(limits.delivery.by),
      "delivery date must be YYYY-MM-DD",
    );
  }
  if (limits.maxMerchants) {
    assert(
      Number.isSafeInteger(limits.maxMerchants.max) &&
        limits.maxMerchants.max >= 1,
      "maxMerchants must be a positive integer",
    );
  }
}

/** Whether a candidate may be picked at all under the delivery limit. */
export function deliverable(
  c: IndexedCandidate,
  limits: BasketLimits,
): boolean {
  if (!limits.delivery) return true;
  return c.deliveryBy !== null && c.deliveryBy <= limits.delivery.by;
}
