import { effectiveImportance, type Requirement } from "@cartel/contracts";
import type { BasketLimits } from "./types";

export interface LimitsFromRequirements {
  limits: BasketLimits;
  /**
   * Hard basket requirements the MILP does not model. The proof engine
   * still checks them on every plan the solver returns.
   */
  unmodeled: Requirement[];
}

function isMoney(
  v: Requirement["target"],
): v is { amountMinor: number; currency: string } {
  return (
    typeof v === "object" &&
    v !== null &&
    !Array.isArray(v) &&
    "amountMinor" in v
  );
}

/**
 * Maps the hard basket-scope requirements onto solver limits:
 * `basket.delivered_total` ≤ money, `basket.delivery_latest` ≤ / before a
 * date, and `basket.merchant_count` ≤ n. When several requirements bound
 * the same limit, the tightest one is kept with its ID. Unconfirmed AI
 * assumptions are preferences (SDD §7.2) and never become limits.
 */
export function limitsFromRequirements(
  requirements: readonly Requirement[],
  currency: string,
): LimitsFromRequirements {
  const limits: BasketLimits = {};
  const unmodeled: Requirement[] = [];
  for (const r of requirements) {
    if (r.scope !== "basket" || effectiveImportance(r) !== "hard") continue;
    const t = r.target;
    if (
      r.field === "basket.delivered_total" &&
      r.op === "lte" &&
      isMoney(t) &&
      t.currency === currency
    ) {
      if (!limits.budget || t.amountMinor < limits.budget.maxTotalMinor) {
        limits.budget = { requirementId: r.id, maxTotalMinor: t.amountMinor };
      }
    } else if (
      r.field === "basket.delivery_latest" &&
      (r.op === "lte" || r.op === "before") &&
      typeof t === "string"
    ) {
      // `before` is strict: arriving the day before the date is the latest allowed.
      const by = r.op === "before" ? dayBefore(t) : t;
      if (!limits.delivery || by < limits.delivery.by) {
        limits.delivery = { requirementId: r.id, by };
      }
    } else if (
      r.field === "basket.merchant_count" &&
      r.op === "lte" &&
      typeof t === "number"
    ) {
      if (!limits.maxMerchants || t < limits.maxMerchants.max) {
        limits.maxMerchants = { requirementId: r.id, max: t };
      }
    } else {
      unmodeled.push(r);
    }
  }
  return { limits, unmodeled };
}

function dayBefore(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
