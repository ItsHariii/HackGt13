import {
  AUTONOMY_PRESETS,
  type AutonomyPolicy,
  type Change,
  type ChangeClass,
  type ClassifiedChange,
  type ConsentDiff,
  type ContractBody,
  type ContractItem,
  canonicalize,
  contractHash,
  DIFF_SCHEMA,
  effectiveImportance,
  factsDigest,
  maxSeverity,
  type Offer,
  type ProofReport,
  type ProofResult,
  type Requirement,
  type Verdict,
} from "@proofcart/contracts";
import { decOf, div, mul } from "./decimal";
import { evaluate } from "./evaluate";
import type { Resolved } from "./evidence";
import type { Pack } from "./pack";
import { isIsoDate, isMoney } from "./values";
import { buildView, type EvaluationInput, type View } from "./view";

/*
 * Semantic Consent Diff (SDD §7.6, §7.7). The live checkout is re-proved
 * against the signed requirements, and every difference from the signed
 * contract is classified under the user's autonomy policy. Because the
 * proof re-runs, a same-SKU spec edit that no identity or amount check would
 * notice still flips a verdict, and a hard pass → fail always blocks.
 */

/** Everything the engine reads about a checkout, minus the rules and the clock. */
export type CheckoutState = Omit<
  EvaluationInput,
  "requirements" | "packs" | "now"
>;

export type ApprovedState = {
  contract: ContractBody;
  /** The report whose hash the contract carries in `proof.reportHash`. */
  report: ProofReport;
  /** The checkout the user signed against; supplies the "before" of fact and delivery changes. */
  snapshot: CheckoutState;
};

export class ConsentInputError extends Error {
  override name = "ConsentInputError";
}

export type ConsentResult = {
  diff: ConsentDiff;
  /** The re-proof of the live checkout against the signed requirements. */
  reproof: ProofReport;
};

export async function consentDiff(
  approved: ApprovedState,
  live: CheckoutState,
  packs: readonly Pack[],
  now: string,
): Promise<ConsentResult> {
  const { contract, report } = approved;
  if (report.hash !== contract.proof.reportHash) {
    throw new ConsentInputError(
      "approved report does not match the contract's reportHash",
    );
  }
  const requirements = contract.requirements;
  const reproof = await evaluate({ ...live, requirements, packs, now });
  const liveView = buildView({ ...live, requirements, packs, now });
  const approvedView = buildView({
    ...approved.snapshot,
    requirements,
    packs,
    now: report.evaluatedAt,
  });

  const pairs = pairItems(contract.items, liveView);
  const liveTotals = totalsOf(liveView);
  const changes: Change[] = [
    ...identityChanges(pairs),
    ...verdictChanges(report.results, reproof.results),
    ...(await factChanges(pairs, approvedView, liveView, requirements, packs)),
    ...economicsChanges(contract, pairs, liveTotals),
    ...deliveryChanges(pairs, approvedView, requirements),
    ...termsChanges(pairs),
    ...recurringChanges(pairs),
  ];

  const ctx = classifyContext(contract, changes);
  const classified = changes
    .map((c) => ({ ...c, ...classify(c, ctx) }) as ClassifiedChange)
    .sort((a, b) => cmp(changeKey(a), changeKey(b)));

  const diff: ConsentDiff = {
    schema: DIFF_SCHEMA,
    contractHash: await contractHash(contract),
    classification: maxSeverity(classified.map((c) => c.class)),
    changes: classified,
    reproofHash: reproof.hash,
    currentTotalMinor: Math.max(0, liveTotals.total ?? 0),
    evaluatedAt: now,
  };
  return { diff, reproof };
}

/**
 * The signed items and economics for a checkout, computed the same way the
 * diff reads them back, so an unchanged checkout diffs as `identical`.
 * Throws if a price or quote is missing: nothing unknown can be signed.
 */
export async function approvalItems(
  state: CheckoutState,
  requirements: readonly Requirement[],
  packs: readonly Pack[],
  now: string,
): Promise<{
  items: ContractItem[];
  economics: {
    currency: string;
    merchandiseMinor: number;
    shippingMinor: number;
    taxEstimateMinor: number;
  };
}> {
  const view = buildView({ ...state, requirements, packs, now });
  const items: ContractItem[] = [];
  // Signed items follow the basket's own line order, the order the user reviewed.
  const ordered = state.basket.lines.map(
    (l) =>
      view.items.find(
        (i) => i.role === l.role && i.offer.id === l.offerId,
      ) as View["items"][number],
  );
  for (const line of ordered) {
    const o = line.offer;
    const price = line.get("offer.price").value;
    items.push({
      role: line.role,
      merchant: o.merchant,
      sellerId: o.sellerId,
      sku: o.sku,
      ...(o.gtin ? { gtin: o.gtin } : {}),
      ...(o.variant ? { variant: o.variant } : {}),
      title: o.title,
      qty: line.qty,
      unitPriceMinor: isMoney(price) ? price.amountMinor : o.price.amountMinor,
      terms: liveTerms(line),
      ...(o.recurring ? { recurring: o.recurring } : {}),
      factsDigest: await factsDigest(view.productFacts(line)),
    });
  }
  const t = totalsOf(view);
  const currency = view.items[0]?.offer.price.currency;
  if (
    t.merchandise === null ||
    t.shipping === null ||
    t.tax === null ||
    !currency
  ) {
    throw new ConsentInputError(
      "price, shipping or tax is unknown; refresh the checkout before signing",
    );
  }
  return {
    items,
    economics: {
      currency,
      merchandiseMinor: t.merchandise,
      shippingMinor: t.shipping,
      taxEstimateMinor: t.tax,
    },
  };
}

// ---------------------------------------------------------------- pairing

type LiveItem = View["items"][number];
type Pair = {
  role: string;
  before: ContractItem | null;
  after: LiveItem | null;
};

/** Matches signed items to live lines by role (then by SKU within a role). */
function pairItems(items: readonly ContractItem[], view: View): Pair[] {
  const roles = [
    ...new Set([...items.map((i) => i.role), ...view.items.map((i) => i.role)]),
  ].sort(cmp);
  const out: Pair[] = [];
  for (const role of roles) {
    const before = items
      .filter((i) => i.role === role)
      .sort((a, b) => cmp(a.sku, b.sku));
    const after = view.items
      .filter((i) => i.role === role)
      .sort((a, b) => cmp(a.offer.sku, b.offer.sku));
    for (let k = 0; k < Math.max(before.length, after.length); k++) {
      out.push({ role, before: before[k] ?? null, after: after[k] ?? null });
    }
  }
  return out;
}

// ---------------------------------------------------------------- changes

const IDENTITY: readonly [
  "sku" | "variant" | "gtin" | "seller" | "merchant" | "qty",
  (i: ContractItem) => string | number | null,
  (l: LiveItem) => string | number | null,
][] = [
  ["sku", (i) => i.sku, (l) => l.offer.sku],
  ["variant", (i) => i.variant ?? null, (l) => l.offer.variant ?? null],
  ["gtin", (i) => i.gtin ?? null, (l) => l.offer.gtin ?? null],
  ["seller", (i) => i.sellerId, (l) => l.offer.sellerId],
  ["merchant", (i) => i.merchant, (l) => l.offer.merchant],
  ["qty", (i) => i.qty, (l) => l.qty],
];

function identityChanges(pairs: readonly Pair[]): Change[] {
  const out: Change[] = [];
  for (const { role, before, after } of pairs) {
    for (const [attribute, fromItem, fromLine] of IDENTITY) {
      const b = before ? fromItem(before) : null;
      const a = after ? fromLine(after) : null;
      if (b !== a)
        out.push({ kind: "identity", role, attribute, before: b, after: a });
    }
  }
  return out;
}

/** Result identity without offer IDs, so a swapped item compares with its predecessor. */
function slotKey(r: ProofResult, seen: Map<string, number>): string {
  const s = r.scope;
  const base =
    s.kind === "item"
      ? `item:${s.role}`
      : s.kind === "pair"
        ? `pair:${s.roles.join("+")}`
        : s.kind === "merchant"
          ? `merchant:${s.merchant}`
          : s.kind;
  const key = `${r.requirementId}\u0000${base}`;
  const n = seen.get(key) ?? 0;
  seen.set(key, n + 1);
  return `${key}\u0000${n}`;
}

function verdictChanges(
  before: readonly ProofResult[],
  after: readonly ProofResult[],
): Change[] {
  const index = (results: readonly ProofResult[]) => {
    const seen = new Map<string, number>();
    return new Map(results.map((r) => [slotKey(r, seen), r]));
  };
  const b = index(before);
  const a = index(after);
  const out: Change[] = [];
  for (const key of [...new Set([...b.keys(), ...a.keys()])].sort(cmp)) {
    const x = b.get(key);
    const y = a.get(key);
    const beforeVerdict: Verdict = x?.verdict ?? "unknown";
    const afterVerdict: Verdict = y?.verdict ?? "unknown";
    if (beforeVerdict === afterVerdict) continue;
    out.push({
      kind: "verdict",
      requirementId: (x ?? y)?.requirementId as string,
      importance: (y ?? x)?.importance ?? "hard",
      before: beforeVerdict,
      after: afterVerdict,
    });
  }
  return out;
}

async function factChanges(
  pairs: readonly Pair[],
  approvedView: View,
  liveView: View,
  requirements: readonly Requirement[],
  packs: readonly Pack[],
): Promise<Change[]> {
  const hard = hardFields(requirements, packs);
  const out: Change[] = [];
  for (const { role, before, after } of pairs) {
    if (!before || !after || before.sku !== after.offer.sku) continue;
    const liveFacts = liveView.productFacts(after);
    if ((await factsDigest(liveFacts)) === before.factsDigest) continue;
    const old = approvedView.items.find(
      (i) => i.role === role && i.offer.sku === before.sku,
    );
    const oldFacts = old ? approvedView.productFacts(old) : [];
    const fields = [
      ...new Set([...oldFacts, ...liveFacts].map((f) => f.field)),
    ].sort(cmp);
    for (const field of fields) {
      const x = old ? old.get(field) : null;
      const y = after.get(field);
      if (x && claim(x) === claim(y)) continue;
      out.push({
        kind: "fact",
        role,
        field,
        before: x?.value ?? null,
        after: y.value,
        hardField: hard.has(field),
      });
    }
  }
  return out;
}

function claim(r: Resolved): string {
  return canonicalize({ value: r.value, state: r.state, conflict: r.conflict });
}

/** Fields a hard requirement reads directly, through a derivation, or through a pair rule. */
export function hardFields(
  requirements: readonly Requirement[],
  packs: readonly Pack[],
): Set<string> {
  const direct = requirements
    .filter((r) => effectiveImportance(r) === "hard")
    .map((r) => r.field);
  const out = new Set<string>();
  const inputsOf = new Map<string, readonly string[]>();
  for (const p of packs)
    for (const d of p.derive)
      if (!inputsOf.has(d.output)) inputsOf.set(d.output, d.inputs);
  const visit = (field: string) => {
    if (out.has(field)) return;
    out.add(field);
    for (const i of inputsOf.get(field) ?? []) visit(i);
  };
  direct.forEach(visit);
  return out;
}

type LiveTotals = {
  merchandise: number | null;
  shipping: number | null;
  tax: number | null;
  total: number | null;
};

function totalsOf(view: View): LiveTotals {
  const amount = (field: string) => {
    const v = view.basket.get(field).value;
    return isMoney(v) ? v.amountMinor : null;
  };
  return {
    merchandise: amount("basket.merchandise_total"),
    shipping: amount("basket.shipping_total"),
    tax: amount("basket.tax_total"),
    total: amount("basket.delivered_total"),
  };
}

function economicsChanges(
  contract: ContractBody,
  pairs: readonly Pair[],
  live: LiveTotals,
): Change[] {
  const out: Change[] = [];
  for (const { role, before, after } of pairs) {
    if (!before || !after || before.sku !== after.offer.sku) continue;
    const price = after.get("offer.price").value;
    const afterMinor = isMoney(price)
      ? price.amountMinor
      : after.offer.price.amountMinor;
    if (afterMinor !== before.unitPriceMinor) {
      out.push({
        kind: "economics",
        attribute: "unit_price",
        role,
        beforeMinor: before.unitPriceMinor,
        afterMinor,
      });
    }
  }
  const e = contract.economics;
  const push = (
    attribute: "shipping" | "tax" | "total",
    beforeMinor: number,
    afterMinor: number | null,
  ) => {
    if (afterMinor !== null && afterMinor !== beforeMinor) {
      out.push({ kind: "economics", attribute, beforeMinor, afterMinor });
    }
  };
  push("shipping", e.shippingMinor, live.shipping);
  push("tax", e.taxEstimateMinor, live.tax);
  push(
    "total",
    e.merchandiseMinor + e.shippingMinor + e.taxEstimateMinor,
    live.total,
  );
  return out;
}

/** The latest delivery the signed requirements allow, if any. */
function deliveryDeadline(
  requirements: readonly Requirement[],
): { date: string; strict: boolean } | null {
  let best: { date: string; strict: boolean } | null = null;
  for (const r of requirements) {
    if (r.field !== "basket.delivery_latest" && r.field !== "offer.delivery_by")
      continue;
    if ((r.op !== "lte" && r.op !== "before") || !isIsoDate(r.target)) continue;
    const candidate = { date: r.target, strict: r.op === "before" };
    if (!best || Date.parse(candidate.date) < Date.parse(best.date))
      best = candidate;
  }
  return best;
}

function deliveryChanges(
  pairs: readonly Pair[],
  approvedView: View,
  requirements: readonly Requirement[],
): Change[] {
  const deadline = deliveryDeadline(requirements);
  const out: Change[] = [];
  for (const { role, before, after } of pairs) {
    if (!before || !after || before.sku !== after.offer.sku) continue;
    const old = approvedView.items.find(
      (i) => i.role === role && i.offer.sku === before.sku,
    );
    const b =
      dateOf(old?.get("offer.delivery_by")) ?? old?.offer.deliveryBy ?? null;
    const a =
      dateOf(after.get("offer.delivery_by")) ?? after.offer.deliveryBy ?? null;
    if (b === a) continue;
    const within =
      a !== null &&
      (!deadline ||
        (deadline.strict
          ? Date.parse(a) < Date.parse(deadline.date)
          : dayOf(a) <= dayOf(deadline.date)));
    out.push({
      kind: "delivery",
      role,
      before: b,
      after: a,
      withinDeadline: within,
    });
  }
  return out;
}

function dateOf(r: Resolved | undefined): string | null {
  return r && isIsoDate(r.value) ? r.value.slice(0, 10) : null;
}

function dayOf(s: string): number {
  return Date.parse(`${s.slice(0, 10)}T00:00:00Z`);
}

function termsChanges(pairs: readonly Pair[]): Change[] {
  const out: Change[] = [];
  for (const { role, before, after } of pairs) {
    if (!before || !after || before.sku !== after.offer.sku) continue;
    const b = before.terms;
    const a = liveTerms(after);
    if (a.finalSale !== b.finalSale) {
      out.push({
        kind: "terms",
        role,
        attribute: "final_sale",
        before: b.finalSale,
        after: a.finalSale,
        direction: a.finalSale ? "worsened" : "improved",
      });
    }
    if (a.returnWindowDays !== b.returnWindowDays) {
      out.push({
        kind: "terms",
        role,
        attribute: "return_window",
        before: b.returnWindowDays,
        after: a.returnWindowDays,
        direction:
          a.returnWindowDays < b.returnWindowDays ? "worsened" : "improved",
      });
    }
    if (a.returnFeeMinor !== b.returnFeeMinor) {
      out.push({
        kind: "terms",
        role,
        attribute: "return_fee",
        before: b.returnFeeMinor,
        after: a.returnFeeMinor,
        direction:
          a.returnFeeMinor > b.returnFeeMinor ? "worsened" : "improved",
      });
    }
  }
  return out;
}

/** Terms as the live facts state them, falling back to the offer's own fields. */
function liveTerms(item: LiveItem): Offer["terms"] {
  const t = item.offer.terms;
  const finalSale = item.get("offer.final_sale").value;
  const window = item.get("offer.return_window_days").value;
  const fee = item.get("offer.return_fee").value;
  return {
    finalSale: typeof finalSale === "boolean" ? finalSale : t.finalSale,
    returnWindowDays:
      typeof window === "object" &&
      window !== null &&
      "value" in window &&
      typeof window.value === "number"
        ? window.value
        : t.returnWindowDays,
    returnFeeMinor: isMoney(fee) ? fee.amountMinor : t.returnFeeMinor,
  };
}

function recurringChanges(pairs: readonly Pair[]): Change[] {
  const out: Change[] = [];
  for (const { role, before, after } of pairs) {
    if (!before || !after) continue;
    const b = before.recurring ?? null;
    const a = after.offer.recurring ?? null;
    if (b !== a) out.push({ kind: "recurring", role, before: b, after: a });
  }
  return out;
}

// ---------------------------------------------------------------- policy

export type ClassifyContext = {
  policy: AutonomyPolicy;
  maxTotalMinor: number;
  requirements: readonly Requirement[];
  /** Class of the total's change, which component increases inherit. */
  totalClass: { class: ChangeClass; basis: string } | null;
};

function classifyContext(
  contract: ContractBody,
  changes: readonly Change[],
): ClassifyContext {
  const base: ClassifyContext = {
    policy: contract.autonomy,
    maxTotalMinor: contract.economics.maxTotalMinor,
    requirements: contract.requirements,
    totalClass: null,
  };
  const total = changes.find(
    (c) => c.kind === "economics" && c.attribute === "total",
  );
  return total ? { ...base, totalClass: classify(total, base) } : base;
}

/**
 * Classifies one change (SDD §7.6). The **policy floor** comes first and no
 * preset can relax it: identity, seller or merchant, quantity and new
 * recurring commitments always need re-approval; a hard pass → fail and a
 * total above the signed maximum always block.
 */
export function classify(
  change: Change,
  ctx: ClassifyContext,
): { class: ChangeClass; basis: string } {
  const preset = ctx.policy.preset;
  const strict = preset === "strict";
  switch (change.kind) {
    case "identity":
      return { class: "reapprove", basis: `floor.${change.attribute}` };

    case "recurring":
      return change.after === null
        ? { class: "auto", basis: "policy.recurring_removed" }
        : { class: "reapprove", basis: "floor.recurring" };

    case "verdict": {
      const { before, after } = change;
      if (change.importance === "hard") {
        if (after === "fail") {
          return {
            class: "block",
            basis:
              before === "pass"
                ? "floor.hard_pass_to_fail"
                : "floor.hard_to_fail",
          };
        }
        if (before === "pass")
          return { class: "reapprove", basis: "floor.hard_pass_to_unknown" };
        if (after === "pass")
          return { class: "info", basis: "verdict.improved" };
        return { class: "reapprove", basis: "verdict.hard_changed" };
      }
      const worse = before === "pass";
      if (worse && strict)
        return { class: "reapprove", basis: "strict.preference_worsened" };
      return {
        class: "info",
        basis: worse ? "preference.worsened" : "preference.improved",
      };
    }

    case "fact": {
      const onFactChange = ctx.requirements.some(
        (r) => r.materiality === "on_fact_change" && r.field === change.field,
      );
      if (onFactChange)
        return { class: "reapprove", basis: "requirement.on_fact_change" };
      if (change.hardField) {
        return strict
          ? { class: "reapprove", basis: "strict.hard_fact_change" }
          : { class: "info", basis: `${preset}.hard_fact_change` };
      }
      return { class: "info", basis: "policy.non_hard_fact" };
    }

    case "economics": {
      const { beforeMinor, afterMinor } = change;
      if (change.attribute === "total") {
        if (afterMinor > ctx.maxTotalMinor)
          return { class: "block", basis: "floor.max_total" };
        if (afterMinor < beforeMinor) {
          return strict
            ? { class: "reapprove", basis: "strict.price_decrease" }
            : { class: "auto", basis: `${preset}.total_decrease` };
        }
        return withinTolerance(beforeMinor, afterMinor, ctx.policy)
          ? { class: "auto", basis: `${preset}.total_increase` }
          : { class: "reapprove", basis: `${preset}.total_increase` };
      }
      if (afterMinor < beforeMinor) {
        return strict
          ? { class: "reapprove", basis: "strict.price_decrease" }
          : { class: "auto", basis: `${preset}.price_decrease` };
      }
      if (strict) return { class: "reapprove", basis: "strict.price_increase" };
      return (
        ctx.totalClass ?? { class: "auto", basis: "policy.total_unchanged" }
      );
    }

    case "delivery": {
      const { before, after } = change;
      if (after === null)
        return { class: "reapprove", basis: "policy.delivery_unknown" };
      if (before !== null && dayOf(after) < dayOf(before)) {
        return { class: "auto", basis: "policy.delivery_earlier" };
      }
      if (!change.withinDeadline)
        return { class: "reapprove", basis: "floor.delivery_past_deadline" };
      return strict
        ? { class: "reapprove", basis: "strict.delivery_later" }
        : { class: "auto", basis: `${preset}.delivery_later_within_deadline` };
    }

    case "terms":
      return change.direction === "improved"
        ? { class: "auto", basis: "policy.terms_improved" }
        : { class: "reapprove", basis: "policy.terms_worsened" };
  }
}

/**
 * An increase is automatic only within **both** the percentage and the
 * amount ceilings, and never beyond the preset's own ceilings.
 */
function withinTolerance(
  beforeMinor: number,
  afterMinor: number,
  policy: AutonomyPolicy,
): boolean {
  const ceiling = AUTONOMY_PRESETS[policy.preset];
  const pct = Math.min(policy.tolerances.increasePct, ceiling.increasePct);
  const amount = Math.min(
    policy.tolerances.increaseMinor,
    ceiling.increaseMinor,
  );
  const increase = afterMinor - beforeMinor;
  if (increase > amount) return false;
  const limit = div(mul(decOf(beforeMinor), decOf(pct)), decOf(100));
  return decOf(increase) <= limit;
}

// ---------------------------------------------------------------- ordering

const KIND_ORDER: Record<Change["kind"], number> = {
  verdict: 0,
  identity: 1,
  economics: 2,
  terms: 3,
  delivery: 4,
  recurring: 5,
  fact: 6,
};

/** Within a kind: the total before line prices, identity in the order a person reads it. */
const ATTRIBUTE_ORDER: readonly string[] = [
  "total",
  "unit_price",
  "shipping",
  "tax",
  "sku",
  "variant",
  "gtin",
  "seller",
  "merchant",
  "qty",
  "final_sale",
  "return_window",
  "return_fee",
];

function changeKey(c: ClassifiedChange): string {
  const attribute =
    "attribute" in c ? ATTRIBUTE_ORDER.indexOf(c.attribute) : -1;
  const role = "role" in c ? (c.role ?? "") : "";
  return [
    KIND_ORDER[c.kind],
    String(attribute + 1).padStart(2, "0"),
    role,
    canonicalize(c),
  ].join("\u0000");
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
