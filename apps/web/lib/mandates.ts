import "server-only";
import { CatalogError } from "@cartel/catalog/supabase";
import type { Json } from "@cartel/contracts/db";
import { drainQueue, supabaseQueueStore } from "@cartel/evidence/supabase";
import { runCheckout } from "./checkout";
import { CheckoutError } from "./checkout-service";
import { evidenceStore, greathubAdapter } from "./evidence";
import { logger } from "./logger";
import {
  evaluateMandate,
  MANDATE_ACTOR,
  MANDATE_QUEUE,
  type MandateDeps,
  type MandateStatus,
  type Observation,
} from "./mandate-service";
import { paymentRailId } from "./payment-config";
import { createAdminClient } from "./supabase/admin";

type Db = ReturnType<typeof createAdminClient>;

function storage(error: unknown): never {
  logger.warn({ err: error }, "mandate storage failed");
  throw new CheckoutError("mandate_storage_failed", 503);
}

function deps(db: Db): MandateDeps {
  let adapter: Awaited<ReturnType<typeof greathubAdapter>> | undefined;
  const record = async (
    mandateId: string,
    kind: "checked" | "fired" | "settled",
    observation: Observation | null,
    status?: Exclude<MandateStatus, "armed" | "expired">,
    outcome?: unknown,
  ) => {
    const { error } = await db.rpc("srv_record_mandate", {
      p_mandate: mandateId,
      p_kind: kind,
      p_observation: (observation ?? {}) as Json,
      ...(status ? { p_status: status } : {}),
      ...(outcome ? { p_outcome: outcome as Json } : {}),
    });
    if (error) storage(error);
  };
  return {
    now: () => new Date(),
    async load(id) {
      const { data, error } = await db
        .from("mandates")
        .select(
          "id,status,trigger,not_after,contract_versions!inner(id,status,body,contracts!inner(plans!inner(user_id)))",
        )
        .eq("id", id)
        .maybeSingle();
      if (error) storage(error);
      if (!data) return null;
      const v = data.contract_versions;
      return {
        id: data.id,
        status: data.status,
        trigger: data.trigger,
        notAfter: data.not_after,
        contract: {
          id: v.id,
          status: v.status,
          body: v.body,
          owner: v.contracts.plans.user_id,
        },
      };
    },
    async hasExecution(key) {
      const { data, error } = await db
        .from("payment_executions")
        .select("id")
        .eq("idempotency_key", key)
        .maybeSingle();
      if (error) storage(error);
      return data !== null;
    },
    async observe(sku) {
      adapter ??= await greathubAdapter(evidenceStore(db));
      if (!adapter) throw new CheckoutError("merchant_not_configured", 503);
      const read = await adapter.refreshOffer(sku);
      if (!read.line) throw new Error(`GreatHub priced no line for ${sku}`);
      return {
        sku,
        priceMinor: read.line.offer.priceMinor,
        currency: read.line.offer.currency,
        availability: read.line.offer.availability,
        retrievedAt: read.line.offer.retrievedAt,
      };
    },
    checked: (id, observation) =>
      record(id, "checked", observation, undefined, {
        status: "not_fired",
        observation,
      }),
    fired: (id, observation) => record(id, "fired", observation),
    settle: (id, status, outcome) =>
      record(id, "settled", null, status, outcome),
    async instrumentFor(owner) {
      const { data, error } = await db
        .from("payment_instruments")
        .select("id")
        .eq("user_id", owner)
        .eq("rail", paymentRailId())
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) storage(error);
      return data?.id ?? null;
    },
    checkout: runCheckout,
  };
}

export type MandateDrain = {
  handled: number;
  skipped: number;
  failed: number;
  deadLettered: number;
  fired: number;
  blocked: number;
  executed: number;
};

/** Drains `q_mandate_eval` until empty or the time budget runs out. */
export async function drainMandates(
  requestId: string,
  budgetMs = 20_000,
): Promise<MandateDrain> {
  const db = createAdminClient();
  const d = deps(db);
  const queue = supabaseQueueStore(db);
  const totals: MandateDrain = {
    handled: 0,
    skipped: 0,
    failed: 0,
    deadLettered: 0,
    fired: 0,
    blocked: 0,
    executed: 0,
  };
  const started = Date.now();
  const handle = async (message: unknown) => {
    const t = Date.now();
    const r = await evaluateMandate(message, d);
    const mandateId = (message as { mandateId?: string } | null)?.mandateId;
    if (r.result === "fired") {
      totals.fired++;
      if (r.outcome.status === "paid" || r.outcome.status === "declined")
        totals.executed++;
      else if (r.outcome.status !== "reconcile_required") totals.blocked++;
    }
    logger.info(
      {
        requestId,
        mandateId,
        actor: MANDATE_ACTOR,
        result: r.result,
        ...(r.result === "fired" ? { outcome: r.outcome.status } : {}),
        ...(r.result === "skipped" ? { reason: r.reason } : {}),
        ms: Date.now() - t,
      },
      "mandate evaluated",
    );
    return r.result === "skipped" ? ("skipped" as const) : ("handled" as const);
  };
  while (Date.now() - started < budgetMs) {
    const r = await drainQueue(queue, MANDATE_QUEUE, handle, {
      visibilityS: 60,
      maxReads: 5,
      onError: (err, m) =>
        logger.warn(
          { requestId, msgId: m.msgId, readCt: m.readCt, err },
          "mandate evaluation failed",
        ),
    });
    totals.handled += r.handled;
    totals.skipped += r.skipped;
    totals.failed += r.failed;
    totals.deadLettered += r.deadLettered;
    // Failed messages stay invisible until their timeout; an all-failed batch means drained for now.
    if (r.handled + r.skipped + r.deadLettered === 0) break;
  }
  logger.info(
    { requestId, ...totals, ms: Date.now() - started },
    "mandate queue drained",
  );
  return totals;
}

/** The Chaos Panel's "Run tick now": the cron function, then an in-process drain. */
export async function runMandateTick(requestId: string) {
  const db = createAdminClient();
  const { data: queued, error } = await db.rpc("srv_mandates_tick");
  if (error) storage(error);
  return { queued: queued ?? 0, ...(await drainMandates(requestId)) };
}

async function ownedVersion(db: Db, versionId: string, owner: string) {
  const { data, error } = await db
    .from("contract_versions")
    .select("id,plan_id,contracts!inner(plans!inner(user_id))")
    .eq("id", versionId)
    .eq("contracts.plans.user_id", owner)
    .maybeSingle();
  if (error) storage(error);
  if (!data) throw new CheckoutError("contract_not_found", 404);
  return data;
}

const DB_CODES =
  /^(contract_not_found|contract_not_signed|contract_superseded|mandate_missing|mandate_expired|mandate_already_used|mandate_not_found|mandate_not_armed)$/;

function guardError(error: { message: string }): never {
  if (DB_CODES.test(error.message))
    throw new CheckoutError(
      error.message,
      /not_found$/.test(error.message) ? 404 : 409,
    );
  storage(error);
}

/** T14.1: signed -> armed. The trigger and deadline come from the signed body. */
export async function armMandate(versionId: string, owner: string) {
  const db = createAdminClient();
  const v = await ownedVersion(db, versionId, owner);
  const { data, error } = await db.rpc("srv_arm_mandate", {
    p_version: v.id,
    p_actor: `user:${owner}`,
  });
  if (error) guardError(error);
  return { mandateId: data?.id ?? null, planId: v.plan_id };
}

export async function cancelMandate(mandateId: string, owner: string) {
  const db = createAdminClient();
  const { data: m, error } = await db
    .from("mandates")
    .select("id,contract_version_id")
    .eq("id", mandateId)
    .maybeSingle();
  if (error) storage(error);
  if (!m) throw new CheckoutError("mandate_not_found", 404);
  await ownedVersion(db, m.contract_version_id, owner);
  const cancelled = await db.rpc("srv_cancel_mandate", {
    p_mandate: m.id,
    p_actor: `user:${owner}`,
  });
  if (cancelled.error) guardError(cancelled.error);
  return { mandateId: m.id };
}

export function mandateErrorCode(error: unknown): string {
  if (error instanceof CheckoutError || error instanceof CatalogError)
    return error.code;
  return "mandate_unavailable";
}
