import type {
  Basket,
  EvidenceState,
  Fact,
  Money,
  Offer,
  ReasonCode,
  Requirement,
  Value,
} from "@proofcart/contracts";
import {
  capState,
  derivedState,
  type ResolveContext,
  type Resolved,
  resolveFacts,
  type SourceInfo,
  sortedUnique,
  unknownResolved,
  weakest,
} from "./evidence";
import { type FieldDef, freshnessMs } from "./fields";
import { addMoney, MoneyError, sumMoney, timesQty } from "./money";
import {
  type BasketReader,
  type Derived,
  type DeriveRule,
  fieldDef,
  type ItemReader,
  type Pack,
  type PairRule,
} from "./pack";
import { isIsoDate, isMoney } from "./values";

/**
 * What a merchant's checkout said about shipping, tax and its own total at
 * one moment. Totals are computed by the engine from the lines; the quoted
 * total is only compared against that computation (SDD §8.2).
 */
export type MerchantQuote = {
  merchant: string;
  shipping: Money;
  tax: Money;
  total?: Money;
  state: EvidenceState;
  /** Provenance for results that use this quote, e.g. a checkout snapshot ID. */
  factId: string;
  retrievedAt: string;
  freshUntil?: string;
};

export type EvaluationInput = {
  requirements: readonly Requirement[];
  basket: Basket;
  offers: readonly Offer[];
  facts: readonly Fact[];
  packs: readonly Pack[];
  /** Evaluation time. The engine has no clock; freshness is judged against this. */
  now: string;
  /** Source ID → authority, for conflict resolution. */
  sources?: Readonly<Record<string, SourceInfo>>;
  quotes?: readonly MerchantQuote[];
  /** Order settings ProofCart itself sends to checkout, e.g. `order.substitutions_allowed`. */
  order?: Readonly<Record<string, Value>>;
};

export class EngineInputError extends Error {
  override name = "EngineInputError";
}

/** Price, delivery and terms facts go stale after 60 s unless a quote says otherwise. */
const QUOTE_FRESHNESS = "60s";

type ItemView = ItemReader & { readonly index: number };

export type View = {
  readonly items: readonly ItemView[];
  readonly merchants: readonly string[];
  readonly basket: BasketReader;
  def(field: string): FieldDef | undefined;
  merchant(merchant: string, field: string): Resolved;
  order(field: string): Resolved;
  pair(field: string, a: ItemReader, b: ItemReader): Resolved | null;
  /** The product facts behind one line, for fact diffs and digests. */
  productFacts(item: ItemReader): Fact[];
};

export function buildView(input: EvaluationInput): View {
  const nowMs = Date.parse(input.now);
  if (Number.isNaN(nowMs))
    throw new EngineInputError(`now is not a timestamp: ${input.now}`);
  const ctx: ResolveContext = { nowMs, sources: input.sources ?? {} };
  const packs = input.packs;
  const defCache = new Map<string, FieldDef | undefined>();
  const def = (field: string) => {
    if (!defCache.has(field)) defCache.set(field, fieldDef(field, packs));
    return defCache.get(field);
  };

  const offers = new Map<string, Offer>();
  for (const o of input.offers) {
    if (offers.has(o.id))
      throw new EngineInputError(`offer ${o.id} given twice`);
    offers.set(o.id, o);
  }

  const factIndex = new Map<string, Fact[]>();
  for (const f of input.facts) {
    const key = `${f.subjectKind}\u0000${f.subjectId}\u0000${f.field}`;
    const list = factIndex.get(key);
    if (list) list.push(f);
    else factIndex.set(key, [f]);
  }
  const factsFor = (offer: Offer, field: string) => [
    ...(factIndex.get(`product\u0000${offer.productId}\u0000${field}`) ?? []),
    ...(factIndex.get(`offer\u0000${offer.id}\u0000${field}`) ?? []),
  ];

  const derives = new Map<string, DeriveRule>();
  const pairs: PairRule[] = [];
  for (const p of packs) {
    for (const d of p.derive)
      if (!derives.has(d.output)) derives.set(d.output, d);
    pairs.push(...p.pairs);
  }

  const lines = [...input.basket.lines].sort((a, b) =>
    a.role === b.role ? cmpStr(a.offerId, b.offerId) : cmpStr(a.role, b.role),
  );
  const items: ItemView[] = lines.map((line, index) => {
    const offer = offers.get(line.offerId);
    if (!offer)
      throw new EngineInputError(
        `basket line ${line.role} references unknown offer ${line.offerId}`,
      );
    const memo = new Map<string, Resolved>();
    const item: ItemView = {
      index,
      role: line.role,
      offer,
      qty: line.qty,
      get(field) {
        const hit = memo.get(field);
        if (hit) return hit;
        memo.set(field, unknownResolved("no_fact")); // cycle guard
        const r = resolveItemField(item, field);
        memo.set(field, r);
        return r;
      },
    };
    return item;
  });

  function resolveItemField(item: ItemView, field: string): Resolved {
    const d = def(field);
    const facts = factsFor(item.offer, field);
    if (facts.length > 0 || d?.kind === "subjective")
      return resolveFacts(facts, d, ctx);
    if (field === "offer.returnable") return returnable(item, d);
    const rule = derives.get(field);
    if (rule?.scope === "item")
      return fromDerived(rule.id, rule.compute(item), d);
    return unknownResolved("no_fact");
  }

  function returnable(item: ItemView, d: FieldDef | undefined): Resolved {
    const finalSale = item.get("offer.final_sale");
    const window = item.get("offer.return_window_days");
    if (finalSale.value === true && finalSale.state !== "unknown") {
      return fromDerived(
        "core.returnable",
        { value: false, from: [finalSale] },
        d,
      );
    }
    const days = window.value;
    if (
      finalSale.value === false &&
      typeof days === "object" &&
      days !== null &&
      "value" in days
    ) {
      return fromDerived(
        "core.returnable",
        { value: Number(days.value) > 0, from: [finalSale, window] },
        d,
      );
    }
    return unknownResolved("no_fact", [
      ...finalSale.factIds,
      ...window.factIds,
    ]);
  }

  const quotes = new Map<string, MerchantQuote>();
  for (const q of input.quotes ?? []) {
    if (quotes.has(q.merchant))
      throw new EngineInputError(`two quotes for merchant ${q.merchant}`);
    quotes.set(q.merchant, q);
  }
  const merchants = [...new Set(items.map((i) => i.offer.merchant))].sort(
    cmpStr,
  );

  function quoteState(q: MerchantQuote): {
    state: EvidenceState;
    reason: ReasonCode | null;
  } {
    const until = q.freshUntil
      ? Date.parse(q.freshUntil)
      : Date.parse(q.retrievedAt) + freshnessMs(QUOTE_FRESHNESS);
    return nowMs > until
      ? { state: "unknown", reason: "stale" }
      : { state: q.state, reason: null };
  }

  function moneyTotal(
    parts: readonly Resolved[],
    currency: string | undefined,
  ): Resolved {
    const unknown = parts.find(
      (p) => p.state === "unknown" || !isMoney(p.value),
    );
    const ids = parts.flatMap((p) => p.factIds);
    if (unknown) return unknownResolved(unknown.reason ?? "no_fact", ids);
    try {
      const value = sumMoney(
        parts.map((p) => p.value as Money),
        currency ?? (parts[0]?.value as Money | undefined)?.currency ?? "USD",
      );
      return {
        value,
        state: weakest(parts.map((p) => p.state)),
        reason: null,
        conflict: parts.some((p) => p.conflict),
        factIds: sortedUnique(ids),
      };
    } catch (e) {
      if (e instanceof MoneyError) return unknownResolved("incomparable", ids);
      throw e;
    }
  }

  function lineTotal(item: ItemView): Resolved {
    const price = item.get("offer.price");
    if (price.state === "unknown" || !isMoney(price.value)) return price;
    return { ...price, value: timesQty(price.value, item.qty) };
  }

  function quotePart(merchant: string, part: "shipping" | "tax"): Resolved {
    const q = quotes.get(merchant);
    if (!q) return unknownResolved("no_fact");
    const { state, reason } = quoteState(q);
    return {
      value: q[part],
      state,
      reason,
      conflict: false,
      factIds: [q.factId],
    };
  }

  /** Merchandise, shipping, tax and delivered total over a subset of lines. */
  function totals(subset: readonly ItemView[], ms: readonly string[]) {
    const merchandise = moneyTotal(subset.map(lineTotal), undefined);
    const currency = isMoney(merchandise.value)
      ? merchandise.value.currency
      : undefined;
    const shipping = moneyTotal(
      ms.map((m) => quotePart(m, "shipping")),
      currency,
    );
    const tax = moneyTotal(
      ms.map((m) => quotePart(m, "tax")),
      currency,
    );
    let delivered = moneyTotal([merchandise, shipping, tax], currency);
    const quoted = ms.map((m) => quotes.get(m)?.total);
    if (
      delivered.state !== "unknown" &&
      isMoney(delivered.value) &&
      quoted.every((t) => t !== undefined)
    ) {
      try {
        const claimed = quoted.reduce<Money>(
          (sum, t) => addMoney(sum, t as Money),
          {
            amountMinor: 0,
            currency: delivered.value.currency,
          },
        );
        if (claimed.amountMinor !== delivered.value.amountMinor) {
          delivered = unknownResolved(
            "total_mismatch",
            delivered.factIds,
            delivered.value,
            true,
          );
        }
      } catch (e) {
        if (!(e instanceof MoneyError)) throw e;
        delivered = unknownResolved(
          "total_mismatch",
          delivered.factIds,
          delivered.value,
          true,
        );
      }
    }
    return { merchandise, shipping, tax, delivered };
  }

  function latestDelivery(
    subset: readonly ItemView[],
    d: FieldDef | undefined,
  ): Resolved {
    const parts = subset.map((i) => i.get("offer.delivery_by"));
    const ids = parts.flatMap((p) => p.factIds);
    if (parts.length === 0) return unknownResolved("role_missing");
    const unknown = parts.find(
      (p) => p.state === "unknown" || !isIsoDate(p.value),
    );
    if (unknown) return unknownResolved(unknown.reason ?? "no_fact", ids);
    const latest = parts
      .map((p) => p.value as string)
      .sort((a, b) => Date.parse(a) - Date.parse(b))
      .at(-1) as string;
    return {
      value: latest,
      state: capState(weakest(parts.map((p) => p.state)), d?.maxState),
      reason: null,
      conflict: parts.some((p) => p.conflict),
      factIds: sortedUnique(ids),
    };
  }

  const verified = (value: Value, factIds: string[] = []): Resolved => ({
    value,
    state: "verified",
    reason: null,
    conflict: false,
    factIds,
  });

  const byRole = (role: string) => items.filter((i) => i.role === role);

  const basketMemo = new Map<string, Resolved>();
  const basket: BasketReader = {
    items,
    byRole,
    requirements: input.requirements,
    get(field) {
      const hit = basketMemo.get(field);
      if (hit) return hit;
      basketMemo.set(field, unknownResolved("no_fact"));
      const r = resolveBasketField(field);
      basketMemo.set(field, r);
      return r;
    },
  };

  function resolveBasketField(field: string): Resolved {
    const d = def(field);
    switch (field) {
      case "basket.merchandise_total":
        return totals(items, merchants).merchandise;
      case "basket.shipping_total":
        return totals(items, merchants).shipping;
      case "basket.tax_total":
        return totals(items, merchants).tax;
      case "basket.delivered_total":
        return totals(items, merchants).delivered;
      case "basket.delivery_latest":
        return latestDelivery(items, d);
      case "basket.merchant_count":
        return verified({ value: merchants.length, unit: "count" });
      case "basket.item_count":
        return verified({
          value: items.reduce((n, i) => n + i.qty, 0),
          unit: "count",
        });
      case "basket.missing_roles":
        return missingRoles();
    }
    const rule = derives.get(field);
    if (rule?.scope === "basket")
      return fromDerived(rule.id, rule.compute(basket), d);
    return unknownResolved("no_fact");
  }

  function missingRoles(): Resolved {
    const seen = new Set<string>();
    const missing: string[] = [];
    const from: Resolved[] = [];
    let undecided = false;
    for (const p of packs) {
      for (const r of p.roles) {
        if (seen.has(r.role)) continue;
        seen.add(r.role);
        if (byRole(r.role).length > 0) continue;
        if (r.required === true) missing.push(r.role);
        else if (typeof r.required === "function") {
          const decided = r.required(basket);
          if (decided === null) undecided = true;
          else {
            from.push(...decided.from);
            if (decided.required) missing.push(r.role);
          }
        }
      }
    }
    missing.sort(cmpStr);
    const ids = from.flatMap((f) => f.factIds);
    if (undecided) return unknownResolved("no_fact", ids, missing);
    const state =
      from.length === 0 ? "verified" : weakest(from.map((f) => f.state));
    if (state === "unknown") {
      return unknownResolved(
        from.find((f) => f.state === "unknown")?.reason ?? "no_fact",
        ids,
        missing,
      );
    }
    return {
      value: missing,
      state,
      reason: null,
      conflict: false,
      factIds: sortedUnique(ids),
    };
  }

  return {
    items,
    merchants,
    basket,
    def,
    merchant(merchant, field) {
      const subset = items.filter((i) => i.offer.merchant === merchant);
      switch (field) {
        case "merchant.subtotal":
          return totals(subset, [merchant]).merchandise;
        case "merchant.delivered_total":
          return totals(subset, [merchant]).delivered;
        case "merchant.delivery_latest":
          return latestDelivery(subset, def(field));
      }
      return unknownResolved("no_fact");
    },
    order(field) {
      const value = input.order?.[field];
      return value === undefined
        ? unknownResolved("no_fact")
        : verified(value, [`order:${field}`]);
    },
    pair(field, a, b) {
      for (const rule of pairs) {
        if (rule.field !== field) continue;
        if (rule.roles[0] === a.role && rule.roles[1] === b.role) {
          return fromDerived(rule.id, rule.evaluate(a, b), def(field));
        }
        if (rule.roles[0] === b.role && rule.roles[1] === a.role) {
          return fromDerived(rule.id, rule.evaluate(b, a), def(field));
        }
      }
      return null;
    },
    productFacts(item) {
      return input.facts
        .filter(
          (f) =>
            f.subjectKind === "product" && f.subjectId === item.offer.productId,
        )
        .sort((a, b) => cmpStr(a.id, b.id));
    },
  };
}

/** Turns a derivation into a resolved value, applying SDD §7.3's state rules. */
export function fromDerived(
  rule: string,
  d: Derived | null,
  def: FieldDef | undefined,
): Resolved {
  if (!d) return unknownResolved("no_fact");
  const assumptions = [...(d.assumptions ?? [])].sort();
  const ids = d.from.flatMap((f) => f.factIds);
  const blocked = d.from.find((f) => f.state === "unknown");
  if (blocked)
    return unknownResolved(blocked.reason ?? "no_fact", ids, d.value);
  // A derivation with no fact inputs is the engine's own arithmetic.
  const base =
    d.from.length === 0
      ? capState("verified", assumptions.length > 0 ? "estimated" : undefined)
      : derivedState(
          d.from.map((f) => f.state),
          assumptions.length > 0,
        );
  return {
    value: d.value,
    state: capState(base, def?.maxState),
    reason: null,
    conflict: d.from.some((f) => f.conflict),
    factIds: sortedUnique(ids),
    derivation: { rule, assumptions },
  };
}

function cmpStr(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
