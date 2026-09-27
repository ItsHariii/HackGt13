import { randomUUID } from "node:crypto";
import type { Json } from "@cartel/contracts/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  admin,
  createPlan,
  createUser,
  deleteUsers,
  must,
  sha256,
  signedContract,
  type TestUser,
} from "./fixtures";

/*
 * TASKS T16.5: 200 randomized execute attempts against the real guard and
 * webhook functions, with duplicated idempotency keys, concurrent retries,
 * lost responses (timeouts), declines, new-key retries and replayed
 * webhooks. Each attempt follows executeCheckout's DB path
 * (apps/web/lib/checkout-service.ts): find by key → reconcile, else
 * begin → consume the token → dispatch → complete. The merchant is a fake
 * that charges at most once per checkout session, like GreatHub's
 * claim_session. Afterwards: exactly one execution per key, exactly one
 * order per authorized execution, at most one charge and one order per
 * contract, and a verifiable ledger.
 */

const ATTEMPTS = 200;
const CONTRACTS = 24;
const SEED = Number(process.env.FUZZ_SEED ?? 0x5eed16);

/** mulberry32: small, seedable, good enough to pick fuzz actions. */
function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

type Slot = {
  versionId: string;
  contractId: string;
  bodyHash: string;
  sessionId: string;
  orderId: string;
  /** Keys this contract has been paid with, newest last. */
  keys: string[];
};

type Merchant = {
  /** Charges per session; never more than one. */
  charges: Map<string, number>;
  declined: Set<string>;
};

type Outcome = "ok" | "timeout_after_charge" | "timeout_before" | "decline";

const TOTAL = 89_177;

describe("retry fuzz: exactly one execution and one order per key", () => {
  let user: TestUser;
  let planId: string;
  const slots: Slot[] = [];
  const merchant: Merchant = { charges: new Map(), declined: new Set() };
  const random = prng(SEED);
  const pick = <T>(xs: readonly T[]): T =>
    xs[Math.floor(random() * xs.length)] as T;

  beforeAll(async () => {
    user = await createUser();
    planId = await createPlan(user, "Retry fuzz");
    for (let i = 0; i < CONTRACTS; i++) {
      const versionId = await signedContract(user, planId);
      const v = must(
        await admin
          .from("contract_versions")
          .select("contract_id, body_hash")
          .eq("id", versionId)
          .single(),
      );
      slots.push({
        versionId,
        contractId: v.contract_id,
        bodyHash: v.body_hash,
        sessionId: `cs_fuzz_${i}_${randomUUID().slice(0, 8)}`,
        orderId: `dm_ord_fuzz_${i}_${randomUUID().slice(0, 8)}`,
        keys: [`fuzz-${i}-${randomUUID()}`],
      });
    }
  }, 60_000);
  afterAll(() => deleteUsers([user]));

  /** A fresh auto diff tied to the session's snapshot, as recordProof leaves it. */
  async function proof(slot: Slot): Promise<string> {
    const snapshot = must(
      await admin
        .from("checkout_snapshots")
        .insert({
          contract_version_id: slot.versionId,
          merchant_id: "greathub",
          acp_session_id: slot.sessionId,
          state: { fuzz: true },
          state_hash: sha256(slot.sessionId),
        })
        .select("id")
        .single(),
    );
    const diff = must(
      await admin
        .from("consent_diffs")
        .insert({
          contract_version_id: slot.versionId,
          snapshot_id: snapshot.id,
          classification: "auto",
          current_total_minor: TOTAL,
        })
        .select("id")
        .single(),
    );
    return diff.id;
  }

  function orderEvent(slot: Slot, eventId: string) {
    return {
      type: "order_created",
      event_id: eventId,
      created_at: "2026-09-26T14:12:00Z",
      data: {
        type: "order",
        checkout_session_id: slot.sessionId,
        order_id: slot.orderId,
        permalink_url: `https://greathub.example/orders/${slot.orderId}`,
        status: "created",
        total_minor: TOTAL,
        currency: "USD",
        contract: {
          contract_id: slot.contractId,
          version: 1,
          body_hash: slot.bodyHash,
        },
        payment: { rail: "simulated", transaction_id: `txn_${slot.sessionId}` },
      },
    };
  }

  /** GreatHub's webhook for a charged session; `eventId` repeats on redelivery. */
  async function webhook(slot: Slot) {
    if (!merchant.charges.get(slot.sessionId)) return;
    const { error } = await admin.rpc("srv_receive_greathub_event", {
      p_event: orderEvent(slot, `evt_${slot.sessionId}`) as unknown as Json,
    });
    // Two deliveries can race; the loser waits on the row lock and reads "duplicate".
    if (error) throw new Error(`webhook: ${error.message}`);
  }

  async function executionFor(key: string) {
    const { data } = await admin
      .from("payment_executions")
      .select("id, status, contract_version_id")
      .eq("idempotency_key", key)
      .maybeSingle();
    return data;
  }

  /** Replay path: never dispatches again, only asks the merchant what happened. */
  async function reconcile(slot: Slot, executionId: string) {
    const e = must(
      await admin
        .from("payment_executions")
        .select("status, token_consumed_at")
        .eq("id", executionId)
        .single(),
    );
    if (e.status !== "started" || !e.token_consumed_at) return;
    if (merchant.charges.get(slot.sessionId)) {
      const { error } = await admin.rpc("srv_complete_execution", {
        p_execution: executionId,
        p_status: "authorized",
        p_rail_ref: `txn_${slot.sessionId}`,
        p_merchant_id: "greathub",
        p_merchant_order_id: slot.orderId,
      });
      // A concurrent reconcile or webhook may have finished it first.
      if (error && error.message !== "execution_already_completed")
        throw new Error(`reconcile: ${error.message}`);
    }
  }

  /** The merchant's complete: charges a session at most once. */
  function dispatch(
    slot: Slot,
    outcome: Outcome,
  ): "charged" | "declined" | "lost" {
    if (outcome === "timeout_before") return "lost";
    if (merchant.charges.get(slot.sessionId)) return "charged";
    if (outcome === "decline") {
      merchant.declined.add(slot.sessionId);
      return "declined";
    }
    merchant.charges.set(slot.sessionId, 1);
    return "charged";
  }

  async function attempt(slot: Slot, key: string, outcome: Outcome) {
    const existing = await executionFor(key);
    if (existing) return reconcile(slot, existing.id);

    const diff = await proof(slot);
    const begun = await admin.rpc("srv_begin_execution", {
      p_version: slot.versionId,
      p_idem: key,
      p_diff: diff,
      p_rail: "simulated",
    });
    if (begun.error) {
      // A new key while another execution owns the contract is refused, never charged.
      expect(["contract_not_signed", "idempotency_key_reused"]).toContain(
        begun.error.message,
      );
      return;
    }
    const executionId = begun.data as string;
    const consumed = await admin.rpc("srv_consume_execution_token", {
      p_execution: executionId,
    });
    if (consumed.error) {
      expect(consumed.error.message).toBe("execution_token_consumed");
      return reconcile(slot, executionId);
    }
    const result = dispatch(slot, outcome);
    if (outcome === "timeout_after_charge" || result === "lost") return;
    const { error } = await admin.rpc("srv_complete_execution", {
      p_execution: executionId,
      p_status: result === "charged" ? "authorized" : "declined",
      p_rail_ref: `txn_${slot.sessionId}`,
      ...(result === "charged"
        ? { p_merchant_id: "greathub", p_merchant_order_id: slot.orderId }
        : { p_error: { code: "payment_declined" } }),
    });
    if (error && error.message !== "execution_already_completed")
      throw new Error(`complete: ${error.message}`);
    if (result === "declined") {
      // The user clicks Retry: a new key for the next attempt (T13.7).
      slot.keys.push(`fuzz-retry-${randomUUID()}`);
    }
  }

  it(`${ATTEMPTS} randomized attempts (seed ${SEED})`, async () => {
    const outcomes: Outcome[] = [
      "ok",
      "ok",
      "ok",
      "timeout_after_charge",
      "timeout_after_charge",
      "timeout_before",
      "decline",
    ];
    let done = 0;
    while (done < ATTEMPTS) {
      // A burst of concurrent calls, as double clicks and client retries arrive together.
      const burst = Math.min(1 + Math.floor(random() * 8), ATTEMPTS - done);
      const calls: Promise<unknown>[] = [];
      for (let i = 0; i < burst; i++) {
        const slot = pick(slots);
        const r = random();
        if (r < 0.15) {
          calls.push(webhook(slot));
        } else if (r < 0.22) {
          // A client retry that wrongly mints a new key.
          calls.push(
            attempt(slot, `fuzz-rogue-${randomUUID()}`, pick(outcomes)),
          );
        } else {
          calls.push(attempt(slot, slot.keys.at(-1) as string, pick(outcomes)));
        }
      }
      await Promise.all(calls);
      done += burst;
    }
    // Eventually every charged session's webhook arrives, possibly twice.
    for (const slot of slots) {
      await Promise.all([webhook(slot), webhook(slot)]);
    }

    const executions = must(
      await admin
        .from("payment_executions")
        .select("id, idempotency_key, contract_version_id, status")
        .in(
          "contract_version_id",
          slots.map((s) => s.versionId),
        ),
    );
    const orders = must(
      await admin
        .from("orders")
        .select("execution_id, merchant_order_id")
        .in(
          "execution_id",
          executions.map((e) => e.id),
        ),
    );

    // Exactly one execution per key, and one order per authorized execution.
    const perKey = new Map<string, number>();
    for (const e of executions)
      perKey.set(e.idempotency_key, (perKey.get(e.idempotency_key) ?? 0) + 1);
    expect([...perKey.values()].every((n) => n === 1)).toBe(true);
    for (const e of executions) {
      const n = orders.filter((o) => o.execution_id === e.id).length;
      expect(n, `${e.idempotency_key} (${e.status})`).toBe(
        e.status === "authorized" ? 1 : 0,
      );
    }

    // Per contract: at most one charge, and a charge always ends as one order.
    let charged = 0;
    for (const slot of slots) {
      const mine = executions.filter(
        (e) => e.contract_version_id === slot.versionId,
      );
      const authorized = mine.filter((e) => e.status === "authorized");
      expect(merchant.charges.get(slot.sessionId) ?? 0).toBeLessThanOrEqual(1);
      expect(authorized.length).toBe(merchant.charges.get(slot.sessionId) ?? 0);
      expect(
        orders.filter((o) => o.merchant_order_id === slot.orderId).length,
      ).toBe(authorized.length);
      // Only a declined attempt can leave more than one execution behind.
      expect(mine.length).toBeLessThanOrEqual(slot.keys.length);
      charged += authorized.length;
    }
    if (process.env.FUZZ_STATS)
      console.log(
        JSON.stringify({
          seed: SEED,
          executions: executions.length,
          byStatus: Object.fromEntries(
            ["started", "authorized", "declined"].map((s) => [
              s,
              executions.filter((e) => e.status === s).length,
            ]),
          ),
          orders: orders.length,
          retryKeys: slots.reduce((n, s) => n + s.keys.length - 1, 0),
        }),
      );
    expect(charged).toBeGreaterThan(0);
    expect(executions.length).toBeGreaterThan(CONTRACTS / 2);

    const broken = await admin.rpc("srv_verify_ledger", { p_plan_id: planId });
    expect(broken.error).toBeNull();
    expect(broken.data).toBeNull();
  }, 120_000);
});
