import "server-only";
import { planRoles as aiPlanRoles } from "@cartel/ai";
import {
  effectiveImportance,
  type Fact,
  hashJson,
  Offer,
  type ProofReport,
} from "@cartel/contracts";
import type { Json } from "@cartel/contracts/db";
import { type SpecRefresh, toDrafts } from "@cartel/evidence";
import {
  type CheckoutState,
  evaluate,
  fieldDef,
  offerFacts,
  type Pack,
  type SourceInfo,
} from "@cartel/proof-engine";
import {
  type Plan,
  type SolveResult,
  SolverInputError,
  type SolverProblem,
  solvePlans,
} from "@cartel/solver";
import { aiRouter } from "./ai";
import { checkoutState } from "./checkout-proof";
import { tradeoffText } from "./compare";
import { ALL_PACKS, evidenceStore, greathubAdapter } from "./evidence";
import { logger } from "./logger";
import {
  type Screened,
  type SolveRole,
  screenOffer,
  solveRoles,
  toSolverProblem,
} from "./plan-problem";
import { loadStoredPlan, PlanError } from "./plans";
import type { SolveProgress } from "./solve-progress";
import { createAdminClient } from "./supabase/admin";
import { buildWorkspace, ruleText } from "./workspace";

/*
 * Solves a saved plan into Plans A–C (TASKS T11.3, T11.5; SDD §9):
 *   1. roles from the rules, the pack and the brief (+ A2 when it answers);
 *   2. GreatHub candidates for those roles, each spec page read fresh and
 *      screened against the item rules (fails never reach the solver);
 *   3. the solver picks up to three diverse baskets;
 *   4. each basket is quoted through a throwaway GreatHub checkout, so its
 *      prices, shipping and tax are the merchant's own, and proved;
 *   5. the run, baskets, reports and per-rule results are stored in one
 *      transaction (srv_record_plan_solve), which streams the results.
 * `onProgress` hears each step as it happens (the live "Find plans" view).
 * Only GreatHub baskets are solved: it's the merchant Cartel can pay.
 */

const MERCHANT = "greathub";
/** GreatHub's published policies (seed `greathub.policies`); the checkout quote verifies them. */
const SHIPPING_MINOR = 2_400;
const TAX_RATE_BPS = 700;
const SPEC_CONCURRENCY = 4;

export type SolveOutcome =
  | { status: "solved"; labels: string[] }
  | { status: "infeasible" }
  | {
      status: "error";
      code:
        | "not_found"
        | "no_rules"
        | "merchant_unavailable"
        | "no_candidates"
        | "storage";
    };

type ProductRow = {
  id: string;
  external_id: string;
  title: string;
  gtin: string | null;
  upid: string | null;
  roles: string[];
  offers: {
    id: string;
    seller_id: string | null;
    price_minor: number;
    currency: string;
    availability: string;
    delivery_latest: string | null;
    final_sale: boolean;
    return_policy: Json;
    reference_only: boolean;
    url: string | null;
    retrieved_at: string;
  }[];
};

async function pool<T, R>(
  items: readonly T[],
  size: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i] as T);
      }
    }),
  );
  return out;
}

function returnTerms(policy: Json, finalSale: boolean): Offer["terms"] {
  const p = (policy ?? {}) as Record<string, unknown>;
  const window = Number(p.windowDays ?? 0);
  const fee = Number(p.feeMinor ?? 0);
  return {
    finalSale: finalSale || p.finalSale === true || p.returnable === false,
    returnWindowDays: Number.isInteger(window) && window >= 0 ? window : 0,
    returnFeeMinor: Number.isInteger(fee) && fee >= 0 ? fee : 0,
  };
}

/** Spec claims as facts about one product, from one page read. */
function specFacts(
  spec: SpecRefresh,
  productId: string,
  packs: readonly Pack[],
): Fact[] {
  return toDrafts(
    spec.claims,
    { kind: "product", id: productId },
    spec.source,
    (field) => fieldDef(field, packs),
  ).map((f, n) => ({
    ...f,
    subjectKind: "product" as const,
    id: `${spec.source.id}:${productId}:${n}`,
    conflict: false,
  }));
}

/** Roles A2 wants searched; empty when the AI is off or slow. */
async function aiRoles(
  plan: { id: string; requirements: Parameters<typeof solveRoles>[0] },
  packs: readonly Pack[],
): Promise<string[]> {
  const router = aiRouter();
  if (!router.available()) return [];
  try {
    const result = await aiPlanRoles(router, {
      requirements: plan.requirements,
      packs,
      planId: plan.id,
      signal: AbortSignal.timeout(8_000),
    });
    return result.queries.map((q) => q.role);
  } catch (err) {
    logger.warn({ err }, "A2 roles unavailable; using the pack template");
    return [];
  }
}

export async function solveStoredPlan(
  planId: string,
  onProgress: (p: SolveProgress) => void = () => {},
): Promise<SolveOutcome> {
  const started = performance.now();
  const plan = await loadStoredPlan(planId);
  if (!plan) return { status: "error", code: "not_found" };
  if (plan.requirements.length === 0)
    return { status: "error", code: "no_rules" };
  const db = createAdminClient();
  const store = evidenceStore(db);
  const adapter = await greathubAdapter(store);
  if (!adapter) return { status: "error", code: "merchant_unavailable" };
  const packs = plan.packs.length > 0 ? plan.packs : ALL_PACKS;
  const now = new Date().toISOString();
  const requirements = plan.requirements;

  const set = await db
    .from("requirement_sets")
    .select("id")
    .eq("plan_id", plan.id)
    .eq("version", plan.setVersion)
    .single();
  if (set.error) return { status: "error", code: "storage" };

  const roles: SolveRole[] = solveRoles(
    requirements,
    packs,
    plan.brief,
    await aiRoles(plan, packs),
  );
  const roleIds = roles.map((r) => r.id);
  const products = await db
    .from("products")
    .select(
      "id,external_id,title,gtin,upid,roles,offers(id,seller_id,price_minor,currency,availability,delivery_latest,final_sale,return_policy,reference_only,url,retrieved_at)",
    )
    .eq("source", MERCHANT)
    .overlaps("roles", roleIds)
    .limit(200);
  if (products.error) return { status: "error", code: "storage" };
  const rows = (products.data ?? []) as unknown as ProductRow[];
  if (rows.length === 0) return { status: "error", code: "no_candidates" };

  // Read every candidate's spec page now: product facts are never taken from a stale cache.
  const specs = new Map<string, SpecRefresh>();
  let read = 0;
  onProgress({ phase: "reading", done: 0, total: rows.length });
  await pool(rows, SPEC_CONCURRENCY, async (p) => {
    const slug = p.upid?.startsWith(`${MERCHANT}:`)
      ? p.upid.slice(MERCHANT.length + 1)
      : null;
    if (slug) {
      try {
        const spec = await adapter.refreshSpecs(
          { slug, roles: p.roles.filter((r) => roleIds.includes(r)) },
          packs,
        );
        if (spec.found) specs.set(p.id, spec);
      } catch (err) {
        logger.warn({ err, product: p.external_id }, "spec refresh failed");
      }
    }
    onProgress({ phase: "reading", done: ++read, total: rows.length });
  });

  const sources: Record<string, SourceInfo> = {
    [`catalog:${MERCHANT}`]: { authority: "merchant", name: "GreatHub" },
  };
  const screened: Screened[] = [];
  const byOffer = new Map<string, { product: ProductRow; offer: Offer }>();
  for (const p of rows) {
    const spec = specs.get(p.id);
    if (!spec) continue;
    sources[spec.source.id] = { authority: "merchant", name: "GreatHub" };
    const facts = specFacts(spec, p.id, packs);
    for (const o of p.offers) {
      if (o.reference_only || o.availability === "out_of_stock") continue;
      const parsed = Offer.safeParse({
        id: o.id,
        productId: p.id,
        merchant: MERCHANT,
        sellerId: o.seller_id ?? MERCHANT,
        sku: p.external_id,
        ...(p.gtin ? { gtin: p.gtin } : {}),
        title: p.title,
        price: { amountMinor: o.price_minor, currency: o.currency },
        availability: o.availability,
        ...(o.delivery_latest ? { deliveryBy: o.delivery_latest } : {}),
        terms: returnTerms(o.return_policy, o.final_sale),
        tier: "full",
        ...(o.url ? { url: o.url } : {}),
      });
      if (!parsed.success) continue;
      const offer = parsed.data;
      // Catalog prices are only the seller's word until the checkout quote below.
      const offerSide = offerFacts(offer, {
        sourceId: `catalog:${MERCHANT}`,
        retrievedAt: o.retrieved_at,
        state: "source_stated",
      });
      for (const role of p.roles.filter((r) => roleIds.includes(r))) {
        screened.push(
          screenOffer({
            role,
            offer,
            facts: [...facts, ...offerSide],
            requirements,
            packs,
            now,
            sources,
          }),
        );
      }
      byOffer.set(offer.id, { product: p, offer });
    }
  }

  const problem = toSolverProblem({
    roles,
    screened,
    requirements,
    currency: "USD",
    merchant: {
      id: MERCHANT,
      shippingMinor: SHIPPING_MINOR,
      taxRateBps: TAX_RATE_BPS,
    },
  });
  onProgress({ phase: "solving" });
  let result: SolveResult;
  try {
    result = await solvePlans(problem, { k: 3, engine: "exhaustive" });
  } catch (err) {
    if (!(err instanceof SolverInputError)) throw err;
    result = await solvePlans(problem, { k: 3, engine: "auto" });
  }

  const preferenceText = Object.fromEntries(
    Object.keys(problem.preferenceWeights ?? {}).map((id) => {
      const r = requirements.find((x) => x.id === id);
      return [id, r ? ruleText(r, packs) : id];
    }),
  );
  const context = {
    tradeoffs:
      result.status === "optimal"
        ? Object.fromEntries(
            result.plans.map((p) => [
              p.label,
              tradeoffText(p.tradeoff, preferenceText),
            ]),
          )
        : {},
    titles: Object.fromEntries(
      [...byOffer].map(([id, { offer }]) => [id, offer.title]),
    ),
    roleLabels: Object.fromEntries(roles.map((r) => [r.id, r.label])),
    itemRules: requirements
      .filter((r) => r.scope === "item" && effectiveImportance(r) === "hard")
      .map((r) => ({ id: r.id, text: ruleText(r, packs) })),
    preferences: preferenceText,
  };

  let baskets: Awaited<ReturnType<typeof proveBasket>>[] = [];
  if (result.status === "optimal") {
    const first = result.plans[0]?.label;
    onProgress({ phase: "quoting", labels: result.plans.map((p) => p.label) });
    try {
      baskets = await Promise.all(
        result.plans.map(async (p) => {
          const basket = await proveBasket(p, {
            planId: plan.id,
            byOffer,
            specs,
            adapter,
            requirements,
            packs,
          });
          // The first plan's rows are the ones the workspace opens on.
          if (p.label === first)
            onProgress({
              phase: "proof",
              label: p.label,
              proof: buildWorkspace({
                planId: plan.id,
                title: plan.title,
                path: `/plans/${plan.id}`,
                planLabel: `Plan ${p.label}`,
                requirements,
                checkout: basket.report.checkoutState,
                report: basket.report.report,
                packs,
                waivers: [],
              }).proof,
            });
          return basket;
        }),
      );
    } catch (err) {
      // No plan is stored without the merchant's own quote behind it.
      logger.warn({ err }, "basket quote failed");
      return { status: "error", code: "merchant_unavailable" };
    }
  }

  onProgress({ phase: "saving" });
  const recorded = await db.rpc("srv_record_plan_solve", {
    p_plan: plan.id,
    p_set: set.data.id,
    p_run: {
      inputHash: await hashJson(problem),
      status: result.status,
      objective:
        result.status === "optimal"
          ? (result.plans[0]?.objective ?? null)
          : null,
      conflictSet: result.status === "infeasible" ? [result.conflict] : null,
      ms: Math.round(performance.now() - started),
      problem,
      context,
      baskets,
    } as unknown as Json,
  });
  if (recorded.error) {
    logger.error({ err: recorded.error }, "plan solve not recorded");
    return { status: "error", code: "storage" };
  }
  return result.status === "optimal"
    ? { status: "solved", labels: result.plans.map((p) => p.label) }
    : { status: "infeasible" };
}

/** Quotes one solver plan through GreatHub's checkout and proves it. */
async function proveBasket(
  plan: Plan,
  ctx: {
    planId: string;
    byOffer: Map<string, { product: ProductRow; offer: Offer }>;
    specs: Map<string, SpecRefresh>;
    adapter: NonNullable<Awaited<ReturnType<typeof greathubAdapter>>>;
    requirements: Parameters<typeof evaluate>[0]["requirements"];
    packs: readonly Pack[];
  },
) {
  const lines = plan.lines.map((l) => {
    const hit = ctx.byOffer.get(l.offerId);
    if (!hit) throw new PlanError("invalid");
    return { ...l, ...hit };
  });
  const read = await ctx.adapter.quoteBasket(
    lines.map((l) => ({ id: l.product.external_id, quantity: l.qty })),
  );
  const specs = read.lines.map((rl) => {
    const line = lines.find((l) => l.product.external_id === rl.itemId);
    const spec = line ? ctx.specs.get(line.product.id) : undefined;
    if (!spec) throw new PlanError("invalid");
    return spec;
  });
  const state: CheckoutState = checkoutState(
    {
      planId: ctx.planId,
      merchants: [{ id: MERCHANT }],
      items: lines.map((l) => ({ role: l.role, sku: l.product.external_id })),
    },
    read,
    specs,
    ctx.packs,
  );
  const report: ProofReport = await evaluate({
    ...state,
    requirements: ctx.requirements,
    packs: ctx.packs,
    now: read.source.fetchedAt,
  });
  return {
    label: plan.label,
    items: plan.lines.map((l) => ({
      role: l.role,
      offerId: l.offerId,
      qty: l.qty,
    })),
    report: {
      report,
      hash: report.hash,
      engineVersion: report.engineVersion,
      packs: report.packs,
      summary: report.summary,
      evaluatedAt: report.evaluatedAt,
      checkoutState: state,
      results: report.results.map((r) => ({
        requirementKey: r.requirementId,
        scope: r.scope,
        verdict: r.verdict,
        state: r.evidenceState,
        reason: r.reason ?? null,
        observed: r.observed,
        target: r.target,
      })),
    },
  };
}

export type { SolverProblem };
