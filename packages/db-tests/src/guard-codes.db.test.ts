import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  admin,
  consentDiff,
  createPlan,
  createUser,
  deleteUsers,
  must,
  sha256,
  signedContract,
  type TestUser,
} from "./fixtures";

/*
 * TASKS T16.4: one test per payment-guard rejection code (0007_guard.sql),
 * plus idempotency and execution-token reuse. Every rejected version is
 * checked at the end: no execution row exists for any of them, which is the
 * "0 executions against an invalid contract" release gate (SDD §22.2).
 */

describe("payment guard: every rejection code", () => {
  let user: TestUser;
  let other: TestUser;
  let planId: string;
  const rejected: string[] = [];

  beforeAll(async () => {
    user = await createUser();
    other = await createUser();
    planId = await createPlan(user);
  });
  afterAll(async () => {
    // The gate: nothing the guard rejected ever became an execution.
    if (rejected.length > 0) {
      const rows = must(
        await admin
          .from("payment_executions")
          .select("id")
          .in("contract_version_id", rejected),
      );
      expect(rows).toEqual([]);
    }
    await deleteUsers([user, other]);
  });

  const idem = () => `idem-${randomUUID()}`;

  async function begin(
    version: string,
    diff: string,
    key = idem(),
    instrument?: string,
  ) {
    return admin.rpc("srv_begin_execution", {
      p_version: version,
      p_idem: key,
      p_diff: diff,
      ...(instrument ? { p_instrument: instrument } : {}),
    });
  }

  async function expectRejected(
    version: string,
    diff: string,
    code: string,
    key?: string,
  ) {
    rejected.push(version);
    const { error } = await begin(version, diff, key);
    expect(error?.message).toBe(code);
  }

  /** A version inserted awaiting signature, the way contract review leaves it. */
  async function unsignedContract(
    expiresAt = new Date(Date.now() + 15 * 60_000).toISOString(),
    contractId: string = randomUUID(),
    version = 1,
  ): Promise<string> {
    if (version === 1) {
      must(
        await admin
          .from("contracts")
          .insert({ id: contractId, plan_id: planId })
          .select("id")
          .single(),
      );
    }
    const body = {
      schema: "cartel.contract/1",
      contractId,
      version,
      economics: { currency: "USD", maxTotalMinor: 91_000 },
      merchants: [{ id: "greathub" }],
    };
    const row = must(
      await admin
        .from("contract_versions")
        .insert({
          contract_id: contractId,
          plan_id: planId,
          version,
          body,
          body_hash: sha256(JSON.stringify(body)),
          status: "awaiting_signature",
          autonomy: { preset: "balanced" },
          expires_at: expiresAt,
        })
        .select("id")
        .single(),
    );
    return row.id;
  }

  async function executed(versionId: string) {
    const diff = await consentDiff(versionId, "auto", 89_177);
    const executionId = must(await begin(versionId, diff));
    return { diff, executionId };
  }

  // ------------------------------------------------------------ begin_execution

  it("idempotency_key_invalid: a key shorter than 8 characters", async () => {
    const v = await signedContract(user, planId);
    await expectRejected(
      v,
      await consentDiff(v, "identical", 89_605),
      "idempotency_key_invalid",
      "short",
    );
  });

  it("contract_not_found: an unknown version", async () => {
    const { error } = await begin(randomUUID(), randomUUID());
    expect(error?.message).toBe("contract_not_found");
  });

  it("idempotency_key_reused: the same key for a different contract", async () => {
    const a = await signedContract(user, planId);
    const b = await signedContract(user, planId);
    const key = idem();
    must(await begin(a, await consentDiff(a, "identical", 89_605), key));
    await expectRejected(
      b,
      await consentDiff(b, "identical", 89_605),
      "idempotency_key_reused",
      key,
    );
  });

  it("contract_not_signed: a version still awaiting signature", async () => {
    const v = await unsignedContract();
    await expectRejected(
      v,
      await consentDiff(v, "identical", 89_605),
      "contract_not_signed",
    );
  });

  it("contract_not_signed: an executed version can't be paid again with a new key", async () => {
    const v = await signedContract(user, planId);
    const { executionId } = await executed(v);
    must(
      await admin.rpc("srv_consume_execution_token", {
        p_execution: executionId,
      }),
    );
    must(
      await admin.rpc("srv_complete_execution", {
        p_execution: executionId,
        p_status: "authorized",
        p_rail_ref: "txn_once",
      }),
    );
    const { error } = await begin(v, await consentDiff(v, "identical", 89_605));
    expect(error?.message).toBe("contract_not_signed");
    const rows = must(
      await admin
        .from("payment_executions")
        .select("id")
        .eq("contract_version_id", v),
    );
    expect(rows).toHaveLength(1);
  });

  it("contract_expired: signed, but past its expiry", async () => {
    const v = await unsignedContract(
      new Date(Date.now() - 60_000).toISOString(),
    );
    const body = must(
      await admin
        .from("contract_versions")
        .select("body_hash")
        .eq("id", v)
        .single(),
    );
    await sign(v, body.body_hash);
    await expectRejected(
      v,
      await consentDiff(v, "identical", 89_605),
      "contract_expired",
    );
  });

  it("contract_superseded: a newer version of the same contract exists", async () => {
    const contractId = randomUUID();
    const v1 = await unsignedContract(undefined, contractId, 1);
    const hash = must(
      await admin
        .from("contract_versions")
        .select("body_hash")
        .eq("id", v1)
        .single(),
    ).body_hash;
    await sign(v1, hash);
    await unsignedContract(undefined, contractId, 2);
    await expectRejected(
      v1,
      await consentDiff(v1, "identical", 89_605),
      "contract_superseded",
    );
  });

  it("signature_missing: the verified signature is gone after signing", async () => {
    const v = await signedContract(user, planId);
    must(
      await admin
        .from("contract_signatures")
        .update({ verified_at: null })
        .eq("contract_version_id", v)
        .select("id"),
    );
    await expectRejected(
      v,
      await consentDiff(v, "identical", 89_605),
      "signature_missing",
    );
  });

  it("diff_missing: no diff, or a diff for another version", async () => {
    const v = await signedContract(user, planId);
    await expectRejected(v, randomUUID(), "diff_missing");
    const w = await signedContract(user, planId);
    await expectRejected(
      v,
      await consentDiff(w, "identical", 89_605),
      "diff_missing",
    );
  });

  it.each([
    ["reapprove", 89_605],
    ["block", 88_107],
  ] as const)("material_change: a %s diff", async (classification, total) => {
    const v = await signedContract(user, planId);
    await expectRejected(
      v,
      await consentDiff(v, classification, total),
      "material_change",
    );
  });

  it("stale_reproof: the diff is older than 90 seconds", async () => {
    const v = await signedContract(user, planId);
    const diff = must(
      await admin
        .from("consent_diffs")
        .insert({
          contract_version_id: v,
          classification: "identical",
          current_total_minor: 89_605,
          created_at: new Date(Date.now() - 120_000).toISOString(),
        })
        .select("id")
        .single(),
    );
    await expectRejected(v, diff.id, "stale_reproof");
  });

  it("over_max_total: an auto diff above the signed maximum", async () => {
    const v = await signedContract(user, planId);
    await expectRejected(
      v,
      await consentDiff(v, "auto", 91_001),
      "over_max_total",
    );
  });

  it("instrument_invalid: a card that isn't the plan owner's", async () => {
    const v = await signedContract(user, planId);
    const card = must(
      await admin
        .from("payment_instruments")
        .insert({
          user_id: other.id,
          rail: "simulated",
          rail_ref: `sim_${randomUUID()}`,
          last4: "1111",
        })
        .select("id")
        .single(),
    );
    rejected.push(v);
    const { error } = await begin(
      v,
      await consentDiff(v, "identical", 89_605),
      idem(),
      card.id,
    );
    expect(error?.message).toBe("instrument_invalid");
    const missing = await begin(
      v,
      await consentDiff(v, "identical", 89_605),
      idem(),
      randomUUID(),
    );
    expect(missing.error?.message).toBe("instrument_invalid");
  });

  // ------------------------------------------------------------ idempotency

  it("the same key returns the same execution, even under concurrency", async () => {
    const v = await signedContract(user, planId);
    const diff = await consentDiff(v, "auto", 89_177);
    const key = idem();
    const ids = await Promise.all(
      Array.from({ length: 8 }, () => begin(v, diff, key)),
    );
    const unique = new Set(ids.map((r) => must(r)));
    expect(unique.size).toBe(1);
    const rows = must(
      await admin
        .from("payment_executions")
        .select("id")
        .eq("contract_version_id", v),
    );
    expect(rows).toHaveLength(1);
  });

  // ------------------------------------------------------------ execution token

  it("execution_not_found: consume or complete an unknown execution", async () => {
    const consume = await admin.rpc("srv_consume_execution_token", {
      p_execution: randomUUID(),
    });
    expect(consume.error?.message).toBe("execution_not_found");
    const complete = await admin.rpc("srv_complete_execution", {
      p_execution: randomUUID(),
      p_status: "authorized",
    });
    expect(complete.error?.message).toBe("execution_not_found");
  });

  it("execution_token_consumed: the token can be consumed once, even concurrently", async () => {
    const v = await signedContract(user, planId);
    const { executionId } = await executed(v);
    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        admin.rpc("srv_consume_execution_token", { p_execution: executionId }),
      ),
    );
    expect(results.filter((r) => r.error === null)).toHaveLength(1);
    expect(
      results.filter((r) => r.error !== null).map((r) => r.error?.message),
    ).toEqual(Array(5).fill("execution_token_consumed"));
  });

  it("execution_token_not_consumed: completing before the rail consumed the token", async () => {
    const v = await signedContract(user, planId);
    const { executionId } = await executed(v);
    const { error } = await admin.rpc("srv_complete_execution", {
      p_execution: executionId,
      p_status: "authorized",
    });
    expect(error?.message).toBe("execution_token_not_consumed");
  });

  it("execution_status_invalid: completing back to started", async () => {
    const v = await signedContract(user, planId);
    const { executionId } = await executed(v);
    const { error } = await admin.rpc("srv_complete_execution", {
      p_execution: executionId,
      p_status: "started",
    });
    expect(error?.message).toBe("execution_status_invalid");
  });

  it("execution_already_completed: a conflicting outcome after authorization; the same outcome replays", async () => {
    const v = await signedContract(user, planId);
    const { executionId } = await executed(v);
    must(
      await admin.rpc("srv_consume_execution_token", {
        p_execution: executionId,
      }),
    );
    const order = `dm_ord_${randomUUID().replaceAll("-", "")}`;
    const done = () =>
      admin.rpc("srv_complete_execution", {
        p_execution: executionId,
        p_status: "authorized",
        p_rail_ref: "txn_1",
        p_merchant_id: "greathub",
        p_merchant_order_id: order,
      });
    must(await done());
    // A replayed response or webhook with the same outcome is a no-op...
    must(await done());
    // ...and a different outcome is refused.
    const declined = await admin.rpc("srv_complete_execution", {
      p_execution: executionId,
      p_status: "declined",
    });
    expect(declined.error?.message).toBe("execution_already_completed");
    const orders = must(
      await admin.from("orders").select("id").eq("execution_id", executionId),
    );
    expect(orders).toHaveLength(1);
  });

  it("a declined execution frees the contract for one retry with a new key", async () => {
    const v = await signedContract(user, planId);
    const { executionId } = await executed(v);
    must(
      await admin.rpc("srv_consume_execution_token", {
        p_execution: executionId,
      }),
    );
    must(
      await admin.rpc("srv_complete_execution", {
        p_execution: executionId,
        p_status: "declined",
        p_error: { code: "payment_declined" },
      }),
    );
    const diff = await consentDiff(v, "auto", 89_177);
    const retry = must(await begin(v, diff));
    expect(retry).not.toBe(executionId);
  });

  async function sign(versionId: string, bodyHash: string) {
    const credential = must(
      await admin
        .from("signing_credentials")
        .insert({
          user_id: user.id,
          credential_id: `cred-${randomUUID()}`,
          public_key: "\\x01",
        })
        .select("id")
        .single(),
    );
    must(
      await admin
        .from("contract_signatures")
        .insert({
          contract_version_id: versionId,
          credential_id: credential.id,
          credential_public_key: "\\x01",
          body_hash: bodyHash,
          challenge: `ct1:${bodyHash}:${randomUUID()}`,
          authenticator_data: "\\x02",
          client_data_json: "\\x03",
          signature: "\\x04",
          verified_at: new Date().toISOString(),
        })
        .select("id")
        .single(),
    );
    must(
      await admin.rpc("srv_transition_contract", {
        p_version: versionId,
        p_to: "signed",
        p_actor: `user:${user.id}`,
        p_event: "contract.signed",
      }),
    );
  }
});
