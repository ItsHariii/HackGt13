import "server-only";
import {
  type AutonomyPreset,
  autonomyPolicy,
  CONTRACT_SCHEMA,
  ContractBody,
  contractHash,
  type Requirement,
  requirementSetHash,
} from "@cartel/contracts";
import type { Json } from "@cartel/contracts/db";
import { ShopifyHandoffClient } from "@cartel/payments";
import { approvalItems, evaluate, signGate } from "@cartel/proof-engine";
import { PACKS } from "@cartel/rule-packs";
import { shopify } from "./catalog";
import { bindApprovedCheckout } from "./checkout-approval";
import { ContractDraftError } from "./contract-draft";
import { ALL_PACKS, sources } from "./evidence";
import { logger } from "./logger";
import { createStoredPlan, saveRequirementSet } from "./plans";
import { shopifyToken } from "./shopify-auth";
import { catalogListsStore, shopifyCheckoutState } from "./shopify-state";
import { createAdminClient } from "./supabase/admin";

/*
 * "Buy from this store" for a real Shopify product (TASKS T13.10). Cartel
 * never pays a Shopify store: the contract is a hand-off contract. This
 * saves a one-item plan with the shopper's maximum as its hard rule, opens
 * a real cart and checkout on the store through UCP, proves it with the
 * same builder the hand-off re-check uses, and drafts the contract for
 * signature. After signing, the checkout page re-checks the store and
 * hands the shopper its checkout link.
 */

const CONTRACT_TTL_MS = 24 * 3_600_000;
const ROLE = /^[a-z][a-z0-9_]*$/;

export type ShopifyDraftInput = {
  owner: string;
  /** The variant to buy (the Shopify Catalog's offer external ID). */
  sku: string;
  qty: number;
  maxTotalMinor: number;
  preset: AutonomyPreset;
};

export async function draftShopifyContract(
  input: ShopifyDraftInput,
): Promise<string> {
  const profile = process.env.SHOPIFY_AGENT_PROFILE_URL;
  const token = shopifyToken();
  if (!profile || !token || !sources().has("shopify"))
    throw new ContractDraftError("merchant_unavailable");

  const catalogRead = await shopify(AbortSignal.timeout(15_000)).lookup([
    input.sku,
  ]);
  const product = catalogRead.products.find((p) =>
    p.offers.some((o) => o.externalId === input.sku),
  );
  const offer = product?.offers.find((o) => o.externalId === input.sku);
  const url = offer?.url ?? product?.url;
  if (!product || !offer || !url?.startsWith("https://"))
    throw new ContractDraftError("not_found");
  const origin = new URL(url).origin;
  if (!catalogListsStore(catalogRead, [{ sku: input.sku }], origin))
    throw new ContractDraftError("not_found");
  const merchantId = new URL(origin).hostname;
  const role = product.roles.find((r) => ROLE.test(r)) ?? "item";
  const pack = Object.values(PACKS).find((p) =>
    p.roles.some((r) => r.role === role),
  );

  // A one-item plan whose one hard rule is the shopper's maximum.
  const planId = await createStoredPlan({
    brief: `Buy ${product.title} from ${merchantId}.`,
    pack: pack?.id ?? null,
  });
  const budget: Requirement = {
    id: "r_budget",
    scope: "basket",
    field: "basket.delivered_total",
    op: "lte",
    target: { amountMinor: input.maxTotalMinor, currency: offer.currency },
    importance: "hard",
    evidence: { minStateToPass: "verified" },
    materiality: "always",
    provenance: { kind: "user_selected", via: "form", label: "Maximum total" },
  };
  await saveRequirementSet(planId, [budget]);
  const requirements = [budget];
  const packs = pack ? [pack] : ALL_PACKS;

  const db = createAdminClient();
  const [set, basket] = await Promise.all([
    db
      .from("requirement_sets")
      .select("id")
      .eq("plan_id", planId)
      .eq("version", 1)
      .single(),
    db
      .from("baskets")
      .insert({ plan_id: planId, label: "A" })
      .select("id")
      .single(),
  ]);
  if (set.error || basket.error) throw new ContractDraftError("storage");

  // The store's own checkout for this item: prices, shipping and tax are its.
  const checkout = await new ShopifyHandoffClient({
    origin,
    agentProfile: profile,
    accessToken: token,
  })
    .create([{ sku: input.sku, qty: input.qty }])
    .catch((err) => {
      logger.warn({ err }, "store checkout not created");
      throw new ContractDraftError("merchant_unavailable");
    });
  const now = new Date().toISOString();
  const state = shopifyCheckoutState(
    { planId, merchantId, items: [{ role, sku: input.sku }] },
    checkout,
    catalogRead,
    now,
    crypto.randomUUID(),
  );
  const report = await evaluate({ ...state, requirements, packs, now });
  const gate = signGate(report, []);
  if (!gate.ok)
    throw new ContractDraftError(
      gate.blockers.some((b) => b.verdict === "fail")
        ? "over_budget"
        : "unwaived",
      gate.blockers.map((b) => b.requirementId),
    );
  const { items, economics } = await approvalItems(
    state,
    requirements,
    packs,
    now,
  );
  const body = ContractBody.parse({
    schema: CONTRACT_SCHEMA,
    contractId: crypto.randomUUID(),
    version: 1,
    parentHash: null,
    planId,
    subject: `user:${input.owner}`,
    intent: {
      text: `Buy ${product.title} from ${merchantId}.`,
      requirementSetHash: await requirementSetHash(requirements),
    },
    requirements,
    items,
    economics: { ...economics, maxTotalMinor: input.maxTotalMinor },
    merchants: [{ id: merchantId, origin }],
    autonomy: autonomyPolicy(input.preset),
    waivers: [],
    mandate: null,
    proof: {
      reportHash: report.hash,
      engineVersion: report.engineVersion,
      packs: report.packs,
    },
    issuedAt: now,
    expiresAt: new Date(Date.parse(now) + CONTRACT_TTL_MS).toISOString(),
  });
  const hash = await contractHash(body);
  const drafted = await db.rpc("srv_draft_contract_version", {
    p_plan: planId,
    p_basket: basket.data.id,
    p_set: set.data.id,
    p_report: {
      report,
      hash: report.hash,
      engineVersion: report.engineVersion,
      packs: report.packs,
      summary: report.summary,
      evaluatedAt: report.evaluatedAt,
      checkoutState: state,
    } as unknown as Json,
    p_body: body as unknown as Json,
    p_hash: hash,
  });
  if (drafted.error || !drafted.data) {
    logger.error({ err: drafted.error }, "store contract not recorded");
    throw new ContractDraftError("storage");
  }
  await bindApprovedCheckout(drafted.data, checkout.id, {
    contract: body,
    report,
    snapshot: state,
  });
  const opened = await db.rpc("srv_transition_contract", {
    p_version: drafted.data,
    p_to: "awaiting_signature",
    p_actor: `user:${input.owner}`,
    p_event: "contract.drafted",
    p_payload: { merchant: merchantId, tier: "handoff" },
  });
  if (opened.error) throw new ContractDraftError("storage");
  return planId;
}
