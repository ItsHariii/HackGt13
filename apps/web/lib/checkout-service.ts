import type {
  AcpResult,
  CheckoutSession,
  CompleteSessionRequest,
} from "@cartel/acp";
import {
  type ConsentDiff,
  contractHash,
  type ProofReport,
  reportHash,
} from "@cartel/contracts";
import type { PaymentRail } from "@cartel/payments";
import {
  type ApprovedState,
  type CheckoutState,
  consentDiff,
  type Pack,
} from "@cartel/proof-engine";

export class CheckoutError extends Error {
  constructor(
    readonly code: string,
    readonly status = 409,
  ) {
    super(code);
  }
}
export interface Execution {
  id: string;
  status: "started" | "authorized" | "declined" | "error";
  sessionId: string;
}
export interface CheckoutContext {
  versionId: string;
  bodyHash: string;
  approved: ApprovedState;
  sessionId: string;
  merchantId: string;
}
/** The guard's steps, in order (TASKS T11.7). */
export const GUARD_STEPS = [
  "cart",
  "specs",
  "prove",
  "diff",
  "guard",
  "pay",
  "order",
] as const;
export type GuardStepName = (typeof GUARD_STEPS)[number];
export type StepListener = (
  step: GuardStepName,
  ms: number,
  detail?: string,
) => void;

export interface CheckoutDeps {
  /** Called as each guard step finishes, with how long it took. */
  onStep?: StepListener;
  packs: readonly Pack[];
  rail: PaymentRail;
  now: () => string;
  findExecution: (versionId: string, key: string) => Promise<Execution | null>;
  refresh: (
    context: CheckoutContext,
  ) => Promise<{ session: CheckoutSession; state: CheckoutState }>;
  getSession: (id: string) => Promise<AcpResult<CheckoutSession>>;
  recordProof: (
    context: CheckoutContext,
    state: CheckoutState,
    diff: ConsentDiff,
    report: ProofReport,
  ) => Promise<string>;
  begin: (
    context: CheckoutContext,
    key: string,
    diffId: string,
  ) => Promise<Execution>;
  complete: (
    session: string,
    body: CompleteSessionRequest,
    key: string,
  ) => Promise<AcpResult<CheckoutSession>>;
  finish: (
    execution: Execution,
    status: "authorized" | "declined",
    session: CheckoutSession,
  ) => Promise<void>;
}
export type CheckoutResult =
  | {
      status: "paid" | "declined" | "reconcile_required";
      executionId: string;
      orderId?: string;
    }
  | { status: "paused"; classification: "block" | "reapprove"; diffId: string };

/** Replay is reconciliation-only. A timeout can never authorize a second dispatch. */
async function reconcile(
  execution: Execution,
  deps: CheckoutDeps,
): Promise<CheckoutResult> {
  if (execution.status === "authorized")
    return { status: "paid", executionId: execution.id };
  if (execution.status === "declined")
    return { status: "declined", executionId: execution.id };
  const read = await deps.getSession(execution.sessionId);
  if (read.ok && read.data.status === "completed" && read.data.order) {
    await deps.finish(execution, "authorized", read.data);
    return {
      status: "paid",
      executionId: execution.id,
      orderId: read.data.order.id,
    };
  }
  return { status: "reconcile_required", executionId: execution.id };
}
export async function executeCheckout(
  context: CheckoutContext,
  key: string,
  deps: CheckoutDeps,
): Promise<CheckoutResult> {
  if (!/^[\x21-\x7e]{8,255}$/.test(key))
    throw new CheckoutError("idempotency_key_invalid", 400);
  const { contract, report } = context.approved;
  if (
    (await contractHash(contract)) !== context.bodyHash ||
    (await reportHash(report)) !== report.hash
  )
    throw new CheckoutError("approval_hash_mismatch");
  const existing = await deps.findExecution(context.versionId, key);
  if (existing) return reconcile(existing, deps);
  if (Date.parse(contract.expiresAt) <= Date.parse(deps.now()))
    throw new CheckoutError("contract_expired");
  const step = deps.onStep ?? (() => {});
  let mark = performance.now();
  const lap = () => {
    const now = performance.now();
    const ms = Math.round(now - mark);
    mark = now;
    return ms;
  };
  const fresh = await deps.refresh(context);
  mark = performance.now();
  const ref = fresh.session.x_cartel?.contract;
  if (
    !ref ||
    ref.contract_id !== contract.contractId ||
    ref.version !== contract.version ||
    ref.body_hash !== context.bodyHash ||
    fresh.session.currency !== contract.economics.currency
  )
    throw new CheckoutError("session_contract_mismatch");
  const { diff, reproof } = await consentDiff(
    context.approved,
    fresh.state,
    deps.packs,
    deps.now(),
  );
  step("prove", lap());
  // Even an unchanged unknown/failure is not authorization. Waivers are exact.
  const unsafe = reproof.results.find(
    (r) =>
      r.importance === "hard" &&
      (r.verdict === "fail" ||
        (r.verdict === "unknown" &&
          !contract.waivers.some(
            (w) => w.requirementId === r.requirementId && w.reason === r.reason,
          ))),
  );
  if (unsafe)
    diff.classification = unsafe.verdict === "fail" ? "block" : "reapprove";
  if (fresh.session.status !== "ready_for_payment")
    diff.classification = "block";
  let diffId: string;
  try {
    diffId = await deps.recordProof(context, fresh.state, diff, reproof);
  } catch (error) {
    const concurrent = await deps.findExecution(context.versionId, key);
    if (concurrent) return reconcile(concurrent, deps);
    throw error;
  }
  step(
    "diff",
    lap(),
    `${diff.changes.length} change${diff.changes.length === 1 ? "" : "s"}`,
  );
  if (diff.classification === "block" || diff.classification === "reapprove") {
    step("guard", lap(), diff.classification);
    return { status: "paused", classification: diff.classification, diffId };
  }
  step("guard", lap(), diff.classification);
  const execution = await deps.begin(context, key, diffId);
  if (execution.status !== "started") return reconcile(execution, deps);
  let payment: Awaited<ReturnType<PaymentRail["credentialFor"]>>;
  try {
    const prepared = await deps.rail.prepare(execution.id, contract);
    payment = await deps.rail.credentialFor(prepared);
  } catch {
    // Another request may have consumed the same token. It owns the dispatch.
    return reconcile(execution, deps);
  }
  let result: AcpResult<CheckoutSession>;
  try {
    result = await deps.complete(
      execution.sessionId,
      {
        payment_data: payment,
        x_cartel: { contract: contract as unknown as Record<string, unknown> },
      },
      key,
    );
  } catch {
    return { status: "reconcile_required", executionId: execution.id };
  }
  if (!result.ok)
    return { status: "reconcile_required", executionId: execution.id };
  step("pay", lap(), result.data.status);
  if (result.data.status === "completed" && result.data.order) {
    await deps.finish(execution, "authorized", result.data);
    step("order", lap(), result.data.order.id);
    return {
      status: "paid",
      executionId: execution.id,
      orderId: result.data.order.id,
    };
  }
  if (
    result.data.messages.some(
      (m) =>
        m.type === "error" &&
        (m.code === "payment_declined" || m.code === "requires_3ds"),
    )
  ) {
    await deps.finish(execution, "declined", result.data);
    return { status: "declined", executionId: execution.id };
  }
  return { status: "reconcile_required", executionId: execution.id };
}
