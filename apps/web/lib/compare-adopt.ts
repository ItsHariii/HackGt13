import type { Requirement } from "@cartel/contracts";
import { formatDate, formatMoneyText } from "@cartel/proof-engine";
import { limitsFromRequirements } from "@cartel/solver";

/*
 * Compare's "Use Plan X" (TASKS T11.5): the budget and date tried on the
 * compare screen become the plan's rules. Only the rule that sets each limit
 * changes (the tightest one, as the solver reads it); it is then the
 * shopper's choice, so its provenance says so.
 */

export type TriedLimits = {
  /** Whole dollars. */
  budget?: number | undefined;
  /** ISO date, inclusive. */
  by?: string | undefined;
};

export function adoptLimits(
  requirements: readonly Requirement[],
  tried: TriedLimits,
  currency = "USD",
): Requirement[] {
  const { limits } = limitsFromRequirements(requirements, currency);
  return requirements.map((r) => {
    if (
      tried.budget !== undefined &&
      r.id === limits.budget?.requirementId &&
      typeof r.target === "object" &&
      r.target !== null &&
      "amountMinor" in r.target
    ) {
      const amountMinor = Math.round(tried.budget * 100);
      return {
        ...r,
        target: { ...r.target, amountMinor },
        provenance: {
          kind: "user_selected",
          via: "form",
          label: `Budget ${formatMoneyText(amountMinor, currency).replace(/\.00$/, "")}, from Compare`,
        },
      };
    }
    if (tried.by && r.id === limits.delivery?.requirementId)
      return {
        ...r,
        // The tried date is inclusive, so a strict `before` becomes `lte`.
        op: "lte",
        target: tried.by,
        provenance: {
          kind: "user_selected",
          via: "form",
          label: `Arrive by ${formatDate(tried.by)}, from Compare`,
        },
      };
    return r;
  });
}
