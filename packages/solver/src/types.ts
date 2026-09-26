import type { BasketLine } from "@cartel/contracts";

/*
 * Solver input and output (SDD §9). The solver is pure: it receives
 * candidates that already pass item-level hard rules (or carry a waivable
 * `unknown`), deterministic preference scores, and the basket-level hard
 * limits. It never sees facts, evidence or the LLM.
 */

/** A slot in the basket. The chosen offer is bought `qty` times. */
export interface SolverRole {
  id: string;
  /** Units of the chosen offer. Default 1. */
  qty?: number;
  /** Optional roles may stay empty; required roles must be filled. */
  optional?: boolean;
}

export interface SolverMerchant {
  id: string;
  /** Flat shipping charged once when any item comes from this merchant. */
  shippingMinor: number;
}

/** One offer that may fill one role. */
export interface SolverCandidate {
  /** Offer ID; unique across the problem. */
  id: string;
  role: string;
  merchant: string;
  unitPriceMinor: number;
  /** Latest promised delivery date (ISO `YYYY-MM-DD`); absent when unknown. */
  deliveryBy?: string;
  /**
   * Deterministic preference scores in [0, 1], keyed by preference
   * requirement ID. A missing score counts as 0 (not shown to be met).
   */
  scores?: Readonly<Record<string, number>>;
}

/** The hard basket-level requirements the conflict analysis may relax. */
export interface BasketLimits {
  /** Delivered total (merchandise + shipping + tax) must not exceed this. */
  budget?: { requirementId: string; maxTotalMinor: number };
  /** Every item must be promised by this date (inclusive). */
  delivery?: { requirementId: string; by: string };
  /** At most this many merchants in one basket. */
  maxMerchants?: { requirementId: string; max: number };
}

export type LimitKind = keyof BasketLimits;

export interface SolverProblem {
  currency: string;
  /** Sales tax on merchandise, in basis points (700 = 7%). Rounded half-even. */
  taxRateBps: number;
  roles: readonly SolverRole[];
  merchants: readonly SolverMerchant[];
  candidates: readonly SolverCandidate[];
  /** Offer ID pairs that may not appear in the same basket. */
  incompatible?: ReadonlyArray<readonly [string, string]>;
  limits?: BasketLimits;
  /** Preference weights `w_pref` in [0, 1], supplied by the AI layer (§10). */
  preferenceWeights?: Readonly<Record<string, number>>;
  objective?: {
    /** λ: objective points lost per dollar of delivered total. Default 0.002. */
    costPerDollar?: number;
    /** μ: objective points lost per merchant used. Default 0.05. */
    perMerchant?: number;
  };
}

export interface PlanTotals {
  currency: string;
  merchandiseMinor: number;
  shippingMinor: number;
  taxMinor: number;
  totalMinor: number;
}

/** One way a plan differs from Plan A. Positive `delta` favours this plan. */
export type TradeoffTerm =
  | { kind: "cost"; savesMinor: number }
  | { kind: "preference"; preferenceId: string; delta: number }
  | { kind: "merchants"; fewer: number };

/**
 * What a plan offers over Plan A and what it gives up, each the single
 * largest term in objective points. Plan A has no tradeoff ("Best overall").
 */
export interface PlanTradeoff {
  gain: TradeoffTerm | null;
  loss: TradeoffTerm | null;
}

export interface Plan {
  label: string;
  lines: BasketLine[];
  merchants: string[];
  totals: PlanTotals;
  /** Latest `deliveryBy` among the lines; null when any is unknown. */
  deliveryLatest: string | null;
  /** Unweighted score per preference ID, summed over the lines. */
  preferenceScores: Record<string, number>;
  objective: number;
  tradeoff: PlanTradeoff | null;
}

export type Relaxation =
  | { kind: "budget"; toMinor: number; deltaMinor: number }
  | { kind: "delivery"; to: string }
  | { kind: "maxMerchants"; to: number };

export interface ConflictMember {
  limit: LimitKind;
  requirementId: string;
  /**
   * The smallest change to this one limit, all other limits unchanged, that
   * restores feasibility. Null when relaxing it alone cannot.
   */
  relaxation: Relaxation | null;
}

export interface ConflictSet {
  /** An irreducible set of basket limits that cannot hold together. */
  members: ConflictMember[];
  /**
   * Required roles with no candidate at all. When non-empty, no relaxation
   * of basket limits helps; the item-level rules or the catalog must change.
   */
  emptyRoles: string[];
}

export type Engine = "highs" | "exhaustive";

export type SolveResult =
  | { status: "optimal"; engine: Engine; plans: Plan[] }
  | { status: "infeasible"; engine: Engine; conflict: ConflictSet };
