import {
  ContractBody,
  canonicalize,
  type MandateTrigger,
} from "@cartel/contracts";
import type { CheckoutError, CheckoutResult } from "./checkout-service";

/*
 * Standing-mandate evaluation (SDD §14, T14.3–T14.4). One queue message names
 * one mandate. The worker refreshes the offer, tests the signed trigger and,
 * when it fires, runs the same guarded checkout path as the Pay button
 * (T13.5). Everything here is idempotent: a message can be seen more than
 * once, and the execution's idempotency key is derived from the mandate so a
 * redelivery can only reconcile, never pay twice.
 */

export const MANDATE_QUEUE = "q_mandate_eval";
export const MANDATE_ACTOR = "system:mandate";

export type MandateStatus =
  | "armed"
  | "fired_executed"
  | "fired_blocked"
  | "expired"
  | "cancelled";

export type MandateRow = {
  id: string;
  status: MandateStatus;
  trigger: unknown;
  notAfter: string;
  contract: {
    id: string;
    status: string;
    body: unknown;
    owner: string;
  };
};

/** What the refreshed offer said. Price and availability come from a checkout quote. */
export type Observation = {
  sku: string;
  priceMinor: number | null;
  currency: string;
  availability: string;
  retrievedAt: string;
};

export type Outcome =
  | { status: "paid"; executionId: string; orderId?: string }
  | { status: "declined"; executionId: string }
  | {
      status: "paused";
      classification: "block" | "reapprove";
      diffId: string;
    }
  | { status: "reconcile_required"; executionId: string }
  | { status: "no_instrument" }
  | { status: "error"; code: string }
  | { status: `contract_${string}` };

export interface MandateDeps {
  now: () => Date;
  load: (mandateId: string) => Promise<MandateRow | null>;
  /** The execution this mandate already started, if any (keyed by `mandateKey`). */
  hasExecution: (key: string) => Promise<boolean>;
  observe: (sku: string) => Promise<Observation>;
  checked: (
    mandateId: string,
    observation: Observation | null,
  ) => Promise<void>;
  fired: (mandateId: string, observation: Observation | null) => Promise<void>;
  settle: (
    mandateId: string,
    status: Exclude<MandateStatus, "armed" | "expired">,
    outcome: Outcome,
  ) => Promise<void>;
  instrumentFor: (owner: string) => Promise<string | null>;
  checkout: (
    versionId: string,
    owner: string,
    key: string,
    instrumentId: string,
  ) => Promise<CheckoutResult>;
}

export type MandateEvaluation =
  | { result: "skipped"; reason: string }
  | { result: "not_fired"; observation: Observation | null }
  | { result: "fired"; outcome: Outcome };

/** Deterministic, so a retried message reconciles the first execution. */
export function mandateKey(mandateId: string): string {
  return `mandate-${mandateId}`;
}

const AVAILABLE = new Set(["in_stock", "limited"]);

export function triggerFired(
  trigger: MandateTrigger,
  observation: Observation | null,
): boolean {
  switch (trigger.type) {
    case "price_lte":
      return (
        observation !== null &&
        observation.sku === trigger.sku &&
        observation.priceMinor !== null &&
        observation.priceMinor <= trigger.amountMinor
      );
    case "back_in_stock":
      return (
        observation !== null &&
        observation.sku === trigger.sku &&
        AVAILABLE.has(observation.availability)
      );
    case "recurring":
      // One signed version pays once; the next period needs a new signed version.
      return true;
  }
}

function toOutcome(result: CheckoutResult): Outcome {
  switch (result.status) {
    case "paid":
      return {
        status: "paid",
        executionId: result.executionId,
        ...(result.orderId ? { orderId: result.orderId } : {}),
      };
    case "declined":
      return { status: "declined", executionId: result.executionId };
    case "reconcile_required":
      return { status: "reconcile_required", executionId: result.executionId };
    case "paused":
      return {
        status: "paused",
        classification: result.classification,
        diffId: result.diffId,
      };
  }
}

function isCheckoutError(e: unknown): e is CheckoutError {
  return (
    e instanceof Error &&
    typeof (e as Partial<CheckoutError>).code === "string" &&
    typeof (e as Partial<CheckoutError>).status === "number"
  );
}

async function execute(
  row: MandateRow,
  deps: MandateDeps,
): Promise<MandateEvaluation> {
  const key = mandateKey(row.id);
  const instrument = await deps.instrumentFor(row.contract.owner);
  if (!instrument) {
    const outcome: Outcome = { status: "no_instrument" };
    await deps.settle(row.id, "fired_blocked", outcome);
    return { result: "fired", outcome };
  }
  let result: CheckoutResult;
  try {
    result = await deps.checkout(
      row.contract.id,
      row.contract.owner,
      key,
      instrument,
    );
  } catch (e) {
    // 5xx is infrastructure: let the queue retry. Anything else is a verdict.
    if (!isCheckoutError(e) || e.status >= 500) throw e;
    const outcome: Outcome = { status: "error", code: e.code };
    await deps.settle(row.id, "fired_blocked", outcome);
    return { result: "fired", outcome };
  }
  const outcome = toOutcome(result);
  // Uncertain: stay armed; the next tick reconciles through the same key.
  if (outcome.status === "reconcile_required")
    return { result: "fired", outcome };
  await deps.settle(
    row.id,
    outcome.status === "paused" ? "fired_blocked" : "fired_executed",
    outcome,
  );
  return { result: "fired", outcome };
}

export async function evaluateMandate(
  message: unknown,
  deps: MandateDeps,
): Promise<MandateEvaluation> {
  const mandateId =
    message && typeof message === "object" && "mandateId" in message
      ? String((message as { mandateId: unknown }).mandateId)
      : "";
  if (!mandateId) return { result: "skipped", reason: "malformed_message" };
  const row = await deps.load(mandateId);
  if (!row) return { result: "skipped", reason: "mandate_not_found" };
  if (row.status !== "armed")
    return { result: "skipped", reason: `mandate_${row.status}` };

  // A started execution means the trigger already fired: reconcile only.
  if (await deps.hasExecution(mandateKey(row.id))) return execute(row, deps);

  if (Date.parse(row.notAfter) <= deps.now().getTime())
    return { result: "skipped", reason: "mandate_lapsed" };
  if (row.contract.status !== "armed") {
    const outcome: Outcome = { status: `contract_${row.contract.status}` };
    await deps.settle(row.id, "cancelled", outcome);
    return { result: "fired", outcome };
  }

  // Only the signed trigger counts; the row is a copy made when arming.
  const trigger = ContractBody.safeParse(row.contract.body).data?.mandate
    ?.trigger;
  if (!trigger || canonicalize(trigger) !== canonicalize(row.trigger)) {
    const outcome: Outcome = { status: "error", code: "mandate_mismatch" };
    await deps.settle(row.id, "fired_blocked", outcome);
    return { result: "fired", outcome };
  }

  const observation =
    trigger.type === "recurring" ? null : await deps.observe(trigger.sku);
  if (!triggerFired(trigger, observation)) {
    await deps.checked(row.id, observation);
    return { result: "not_fired", observation };
  }
  await deps.fired(row.id, observation);
  return execute(row, deps);
}
