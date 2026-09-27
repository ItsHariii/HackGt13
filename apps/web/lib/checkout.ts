import "server-only";
import { AcpClient, tapSigner } from "@cartel/acp";
import {
  Basket,
  ContractBody,
  Fact,
  hashJson,
  Offer,
  ProofReport,
} from "@cartel/contracts";
import type { Json } from "@cartel/contracts/db";
import { GuardedPaymentRail } from "@cartel/payments";
import type { CheckoutState } from "@cartel/proof-engine";
import { signingKeyFromEnv } from "@cartel/tap";
import { checkoutState } from "./checkout-proof";
import {
  type CheckoutContext,
  CheckoutError,
  type Execution,
  executeCheckout,
  type StepListener,
} from "./checkout-service";
import { ALL_PACKS, evidenceStore, greathubAdapter } from "./evidence";
import { appOrigin, paymentRailId } from "./payment-config";
import { createAdminClient } from "./supabase/admin";

function checked<T>(r: { data: T; error: unknown }): NonNullable<T> {
  if (r.error || r.data === null)
    throw new CheckoutError("checkout_storage_failed", 503);
  return r.data as NonNullable<T>;
}
export async function loadCheckout(
  versionId: string,
  owner: string,
  tier: "full" | "handoff" = "full",
) {
  const db = createAdminClient();
  const versionResult = await db
    .from("contract_versions")
    .select("*,contracts!inner(plans!inner(user_id))")
    .eq("id", versionId)
    .eq("contracts.plans.user_id", owner)
    .maybeSingle();
  if (versionResult.error)
    throw new CheckoutError("checkout_storage_failed", 503);
  const version = versionResult.data;
  if (!version) throw new CheckoutError("contract_not_found", 404);
  const contract = ContractBody.parse(version.body);
  if (
    contract.subject !== `user:${owner}` ||
    contract.planId !== version.plan_id ||
    contract.contractId !== version.contract_id ||
    contract.version !== version.version
  )
    throw new CheckoutError("contract_linkage_invalid");
  if (
    contract.merchants.length !== 1 ||
    (tier === "full" && contract.merchants[0]?.id !== "greathub")
  )
    throw new CheckoutError("separate_merchant_contract_required");
  const baseUrl =
    tier === "full"
      ? process.env.GREATHUB_BASE_URL
      : contract.merchants[0]?.origin;
  // A hand-off store is either allowlisted here or, in handoff.ts, the store
  // the Shopify Catalog itself lists for every item. Either way HTTPS only.
  const allowlisted =
    tier === "handoff" &&
    (process.env.SHOPIFY_HANDOFF_ORIGINS ?? "")
      .split(",")
      .map((o) => o.trim())
      .includes(baseUrl ?? "");
  if (tier === "handoff" && !baseUrl?.startsWith("https://"))
    throw new CheckoutError("merchant_not_configured", 503);
  if (
    !baseUrl ||
    new URL(contract.merchants[0]?.origin ?? "").origin !==
      new URL(baseUrl).origin
  )
    throw new CheckoutError("merchant_not_configured", 503);
  const [reportResult, snapshotResult] = await Promise.all([
    db
      .from("proof_reports")
      .select("report")
      .eq(
        "id",
        version.proof_report_id ?? "00000000-0000-0000-0000-000000000000",
      )
      .maybeSingle(),
    db
      .from("checkout_snapshots")
      .select("*")
      .eq("contract_version_id", versionId)
      .contains("state", { approval: true })
      .order("fetched_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);
  const storedReport = checked(reportResult);
  const snapshot = checked(snapshotResult);
  if (
    !storedReport ||
    !snapshot ||
    !version.signed_at ||
    snapshot.fetched_at > version.signed_at
  )
    throw new CheckoutError("approved_checkout_missing");
  if ((await hashJson(snapshot.state)) !== snapshot.state_hash)
    throw new CheckoutError("snapshot_hash_mismatch");
  const state = snapshot.state as unknown as { checkout: CheckoutState };
  Basket.parse(state.checkout.basket);
  state.checkout.offers.forEach((o) => {
    Offer.parse(o);
  });
  state.checkout.facts.forEach((f) => {
    Fact.parse(f);
  });
  const context: CheckoutContext = {
    versionId,
    bodyHash: version.body_hash,
    approved: {
      contract,
      report: ProofReport.parse(storedReport.report),
      snapshot: state.checkout,
    },
    sessionId: snapshot.acp_session_id,
    merchantId: snapshot.merchant_id,
  };
  return { db, version, context, baseUrl, allowlisted };
}
export async function runCheckout(
  versionId: string,
  owner: string,
  key: string,
  instrumentId: string,
  onStep?: StepListener,
) {
  const { db, context, baseUrl } = await loadCheckout(versionId, owner);
  const instrument = checked(
    await db
      .from("payment_instruments")
      .select("*")
      .eq("id", instrumentId)
      .eq("user_id", owner)
      .maybeSingle(),
  );
  if (
    !instrument ||
    instrument.rail !== paymentRailId() ||
    instrument.rail === "vic"
  )
    throw new CheckoutError("instrument_invalid", 400);
  const [agentKey, grantKey] = await Promise.all([
    signingKeyFromEnv(process.env.AGENT_SIGNING_JWK, process.env.AGENT_KEY_ID),
    signingKeyFromEnv(process.env.GRANT_SIGNING_JWK, process.env.GRANT_KEY_ID),
  ]);
  const acp = new AcpClient({
    baseUrl,
    signer: tapSigner(agentKey),
    timeoutMs: 30000,
  });
  const adapter = await greathubAdapter(evidenceStore(db));
  if (!adapter) throw new CheckoutError("merchant_not_configured", 503);
  const rail = new GuardedPaymentRail({
    id: instrument.rail,
    issuer: appOrigin(),
    key: grantKey,
    async consume(token) {
      const e = checked(
        await db.rpc("srv_consume_execution_token", { p_execution: token }),
      );
      if (
        e.contract_version_id !== versionId ||
        e.instrument_id !== instrument.id ||
        e.rail !== instrument.rail
      )
        throw new CheckoutError("execution_scope_mismatch");
      return {
        id: e.id,
        bodyHash: context.bodyHash,
        amountMinor: e.amount_minor,
        currency: e.currency,
        instrumentRef: instrument.rail_ref,
        rail: instrument.rail,
      };
    },
  });
  const execution = (e: {
    id: string;
    status: Execution["status"];
  }): Execution => ({
    id: e.id,
    status: e.status,
    sessionId: context.sessionId,
  });
  return executeCheckout(context, key, {
    ...(onStep ? { onStep } : {}),
    rail,
    packs: ALL_PACKS,
    now: () => new Date().toISOString(),
    async findExecution(id, idem) {
      const replayResult = await db
        .from("payment_executions")
        .select("id,status,contract_version_id,instrument_id")
        .eq("idempotency_key", idem)
        .maybeSingle();
      if (replayResult.error)
        throw new CheckoutError("checkout_storage_failed", 503);
      const replay = replayResult.data;
      if (replay) {
        if (
          replay.contract_version_id !== id ||
          replay.instrument_id !== instrument.id
        )
          throw new CheckoutError("idempotency_key_reused");
        return execution(replay);
      }
      const inflightResult = await db
        .from("payment_executions")
        .select("id,status")
        .eq("contract_version_id", id)
        .eq("status", "started")
        .maybeSingle();
      if (inflightResult.error)
        throw new CheckoutError("checkout_storage_failed", 503);
      const inflight = inflightResult.data;
      // A NEW key during an uncertain execution is still reconciliation-only.
      return inflight ? execution(inflight) : null;
    },
    async refresh(ctx) {
      let started = performance.now();
      const read = await adapter.getCheckout(ctx.sessionId);
      onStep?.(
        "cart",
        Math.round(performance.now() - started),
        read.session.status,
      );
      started = performance.now();
      const specs = await Promise.all(
        read.session.line_items.map((line, i) => {
          const item =
            ctx.approved.contract.items.find(
              (item) => item.sku === line.item.id,
            ) ?? ctx.approved.contract.items[i];
          const url = line.item.x_cartel?.spec_url;
          if (!url || !item)
            throw new CheckoutError("checkout_evidence_missing");
          return adapter.refreshSpecs({ url, roles: [item.role] }, ALL_PACKS);
        }),
      );
      onStep?.(
        "specs",
        Math.round(performance.now() - started),
        `${specs.length} page${specs.length === 1 ? "" : "s"}`,
      );
      return {
        session: read.session,
        state: checkoutState(ctx.approved.contract, read, specs, ALL_PACKS),
      };
    },
    getSession: (id) => acp.getSession(id),
    async recordProof(ctx, state, diff, report) {
      const saved = { checkout: state };
      return checked(
        await db.rpc("srv_record_checkout_proof", {
          p_version: versionId,
          p_session: ctx.sessionId,
          p_merchant: ctx.merchantId,
          p_state: saved as unknown as Json,
          p_hash: await hashJson(saved),
          p_diff: diff as unknown as Json,
          p_report: report as unknown as Json,
        }),
      );
    },
    async begin(_ctx, idem, diffId) {
      const id = checked(
        await db.rpc("srv_begin_execution", {
          p_version: versionId,
          p_idem: idem,
          p_diff: diffId,
          p_rail: instrument.rail,
          p_instrument: instrument.id,
        }),
      );
      return execution(
        checked(
          await db
            .from("payment_executions")
            .select("id,status")
            .eq("id", id)
            .single(),
        ),
      );
    },
    complete: (id, body, idem) =>
      acp.completeSession(id, body, { idempotencyKey: idem }),
    async finish(e, status, session) {
      checked(
        await db.rpc("srv_complete_execution", {
          p_execution: e.id,
          p_status: status,
          p_merchant_id: context.merchantId,
          ...(session.order ? { p_merchant_order_id: session.order.id } : {}),
          ...(status === "declined"
            ? {
                p_error: {
                  code: "payment_declined",
                  retry: "user_click_new_key",
                },
              }
            : {}),
        }),
      );
    },
  });
}
