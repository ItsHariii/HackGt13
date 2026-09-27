import "server-only";
import { AcpClient, type Address, tapSigner } from "@cartel/acp";
import {
  type AutonomyPreset,
  autonomyPolicy,
  CONTRACT_SCHEMA,
  ContractBody,
  contractHash,
  requirementSetHash,
  type Waiver,
} from "@cartel/contracts";
import type { Json } from "@cartel/contracts/db";
import type { SpecRefresh } from "@cartel/evidence";
import { approvalItems, evaluate, signGate } from "@cartel/proof-engine";
import { limitsFromRequirements } from "@cartel/solver";
import { signingKeyFromEnv } from "@cartel/tap";
import { bindApprovedCheckout } from "./checkout-approval";
import { checkoutState } from "./checkout-proof";
import { ALL_PACKS, evidenceStore, greathubAdapter } from "./evidence";
import { logger } from "./logger";
import { loadStoredPlan } from "./plans";
import { createAdminClient } from "./supabase/admin";

/*
 * Drafts the contract for one solved plan (TASKS T11.6; SDD §7.5, §12.1).
 * Nothing is taken from the solve: the basket is opened as a real GreatHub
 * checkout with the shopper's address, every spec page is read again, and
 * the body is built from that checkout and its fresh proof. The version is
 * recorded as a draft (srv_draft_contract_version), the session is tagged
 * with the contract, the approved checkout is bound, and only then does the
 * version open for signature.
 */

const MERCHANT = "greathub";
const CONTRACT_TTL_MS = 24 * 3_600_000;

export type DraftError =
  | "not_found"
  | "not_solved"
  | "merchant_unavailable"
  | "rule_fails"
  | "unwaived"
  | "over_budget"
  | "changed"
  | "storage";

export class ContractDraftError extends Error {
  constructor(
    readonly code: DraftError,
    readonly detail?: string[],
  ) {
    super(code);
  }
}

export type DraftInput = {
  planId: string;
  label: string;
  owner: string;
  address: Address;
  preset: AutonomyPreset;
  /** Hard rules the shopper accepts as "can't check" (by requirement ID). */
  waive: readonly string[];
};

type LineRow = {
  role: string;
  qty: number;
  offers: {
    products: {
      id: string;
      external_id: string;
      upid: string | null;
      roles: string[];
    };
  };
};

export async function draftContract(input: DraftInput): Promise<string> {
  const plan = await loadStoredPlan(input.planId);
  if (!plan) throw new ContractDraftError("not_found");
  const db = createAdminClient();
  const packs = plan.packs.length > 0 ? plan.packs : ALL_PACKS;
  const base = process.env.GREATHUB_BASE_URL;
  const adapter = await greathubAdapter(evidenceStore(db));
  if (!adapter || !base) throw new ContractDraftError("merchant_unavailable");

  // The basket the shopper chose, from the latest solve of the current rules.
  const [set, run] = await Promise.all([
    db
      .from("requirement_sets")
      .select("id")
      .eq("plan_id", plan.id)
      .eq("version", plan.setVersion)
      .single(),
    db
      .from("solver_runs")
      .select("id,set_id,status")
      .eq("plan_id", plan.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (
    set.error ||
    !run.data ||
    run.data.status !== "optimal" ||
    run.data.set_id !== set.data.id
  )
    throw new ContractDraftError("not_solved");
  const basket = await db
    .from("baskets")
    .select(
      "id,basket_items(role,qty,offers(products(id,external_id,upid,roles)))",
    )
    .eq("solver_run_id", run.data.id)
    .eq("label", input.label)
    .maybeSingle();
  const lines = (basket.data?.basket_items ?? []) as unknown as LineRow[];
  if (!basket.data || lines.length === 0)
    throw new ContractDraftError("not_solved");

  // A real checkout for these items, with the address the order ships to.
  const agentKey = await signingKeyFromEnv(
    process.env.AGENT_SIGNING_JWK,
    process.env.AGENT_KEY_ID,
  );
  const acp = new AcpClient({
    baseUrl: base,
    signer: tapSigner(agentKey),
    timeoutMs: 30_000,
  });
  const created = await acp.createSession({
    items: lines.map((l) => ({
      id: l.offers.products.external_id,
      quantity: l.qty,
    })),
    fulfillment_address: input.address,
  });
  if (!created.ok) {
    logger.warn({ err: created.error }, "draft checkout not created");
    throw new ContractDraftError("merchant_unavailable");
  }
  const sessionId = created.data.id;
  const read = await adapter.getCheckout(sessionId);
  const specs: SpecRefresh[] = await Promise.all(
    read.lines.map(async (rl) => {
      const line = lines.find(
        (l) => l.offers.products.external_id === rl.itemId,
      );
      const slug = line?.offers.products.upid?.startsWith(`${MERCHANT}:`)
        ? line.offers.products.upid.slice(MERCHANT.length + 1)
        : null;
      if (!line || !slug) throw new ContractDraftError("changed");
      return adapter.refreshSpecs(
        { slug, roles: line.offers.products.roles },
        packs,
      );
    }),
  );
  const items = lines.map((l) => ({
    role: l.role,
    sku: l.offers.products.external_id,
  }));
  const state = checkoutState(
    { planId: plan.id, merchants: [{ id: MERCHANT }], items },
    read,
    specs,
    packs,
  );
  const now = read.source.fetchedAt;
  const requirements = plan.requirements;
  const report = await evaluate({ ...state, requirements, packs, now });

  // Hard rules must pass; an unknown one only goes ahead if the shopper waived it.
  const fails = report.results.filter(
    (r) => r.importance === "hard" && r.verdict === "fail",
  );
  if (fails.length > 0)
    throw new ContractDraftError(
      "rule_fails",
      fails.map((r) => r.requirementId),
    );
  const waivers: Waiver[] = report.results
    .filter(
      (r) =>
        r.importance === "hard" &&
        r.verdict === "unknown" &&
        input.waive.includes(r.requirementId) &&
        r.reason,
    )
    .map((r) => ({
      requirementId: r.requirementId,
      acceptedState: "unknown" as const,
      reason: r.reason as Waiver["reason"],
    }));
  const gate = signGate(report, waivers);
  if (!gate.ok)
    throw new ContractDraftError(
      "unwaived",
      gate.blockers.map((b) => b.requirementId),
    );

  const { items: contractItems, economics } = await approvalItems(
    state,
    requirements,
    packs,
    now,
  );
  const total =
    economics.merchandiseMinor +
    economics.shippingMinor +
    economics.taxEstimateMinor;
  const budget = limitsFromRequirements(requirements, economics.currency).limits
    .budget?.maxTotalMinor;
  if (budget !== undefined && budget < total)
    throw new ContractDraftError("over_budget");

  // The contract's place in the chain: a new contract, or the next version of this plan's.
  const existing = await db
    .from("contract_versions")
    .select("contract_id,version,body_hash")
    .eq("plan_id", plan.id)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing.error) throw new ContractDraftError("storage");
  const issuedAt = new Date().toISOString();
  const body = ContractBody.parse({
    schema: CONTRACT_SCHEMA,
    contractId: existing.data?.contract_id ?? crypto.randomUUID(),
    version: (existing.data?.version ?? 0) + 1,
    parentHash: existing.data?.body_hash ?? null,
    planId: plan.id,
    subject: `user:${input.owner}`,
    intent: {
      text: plan.brief || plan.title,
      requirementSetHash: await requirementSetHash(requirements),
    },
    requirements,
    items: contractItems,
    economics: { ...economics, maxTotalMinor: budget ?? total },
    merchants: [{ id: MERCHANT, origin: new URL(base).origin }],
    autonomy: autonomyPolicy(input.preset),
    waivers,
    mandate: null,
    proof: {
      reportHash: report.hash,
      engineVersion: report.engineVersion,
      packs: report.packs,
    },
    issuedAt,
    expiresAt: new Date(Date.parse(issuedAt) + CONTRACT_TTL_MS).toISOString(),
  });
  const hash = await contractHash(body);
  const drafted = await db.rpc("srv_draft_contract_version", {
    p_plan: plan.id,
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
    if (drafted.error?.message.includes("contract_changed"))
      throw new ContractDraftError("changed");
    logger.error({ err: drafted.error }, "contract draft not recorded");
    throw new ContractDraftError("storage");
  }
  const versionId = drafted.data;

  // Tag the session with the contract, so completion only works for this exact body.
  const tagged = await acp.updateSession(sessionId, {
    x_cartel: {
      contract: {
        contract_id: body.contractId,
        version: body.version,
        body_hash: hash,
      },
    },
  });
  if (!tagged.ok) throw new ContractDraftError("merchant_unavailable");
  await bindApprovedCheckout(versionId, sessionId, {
    contract: body,
    report,
    snapshot: state,
  });
  const opened = await db.rpc("srv_transition_contract", {
    p_version: versionId,
    p_to: "awaiting_signature",
    p_actor: `user:${input.owner}`,
    p_event: "contract.drafted",
    p_payload: { basketId: basket.data.id, plan: input.label },
  });
  if (opened.error) throw new ContractDraftError("storage");
  return versionId;
}
