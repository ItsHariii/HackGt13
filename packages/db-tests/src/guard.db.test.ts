import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  admin,
  consentDiff,
  createPlan,
  createUser,
  deleteUsers,
  must,
  signedContract,
  type TestUser,
} from "./fixtures";

// The guard as the Cartel API will call it: secret key, srv_* RPCs, error codes as messages.
describe("payment guard over the Data API", () => {
  let user: TestUser;
  let planId: string;

  beforeAll(async () => {
    user = await createUser();
    planId = await createPlan(user);
  });
  afterAll(() => deleteUsers([user]));

  it("runs signed -> executing -> executed once, with a verifiable ledger", async () => {
    const versionId = await signedContract(user, planId);
    const diffId = await consentDiff(versionId, "auto", 89_177);
    const idem = `idem-${randomUUID()}`;

    const executionId = must(
      await admin.rpc("srv_begin_execution", {
        p_version: versionId,
        p_idem: idem,
        p_diff: diffId,
      }),
    );
    const replay = must(
      await admin.rpc("srv_begin_execution", {
        p_version: versionId,
        p_idem: idem,
        p_diff: diffId,
      }),
    );
    expect(replay).toBe(executionId);

    must(
      await admin.rpc("srv_consume_execution_token", {
        p_execution: executionId,
      }),
    );
    const second = await admin.rpc("srv_consume_execution_token", {
      p_execution: executionId,
    });
    expect(second.error?.message).toBe("execution_token_consumed");

    must(
      await admin.rpc("srv_complete_execution", {
        p_execution: executionId,
        p_status: "authorized",
        p_rail_ref: "txn_test",
        p_merchant_id: "greathub",
        p_merchant_order_id: `dm_ord_${randomUUID().replaceAll("-", "")}`,
      }),
    );

    // The owner sees the outcome through RLS; the chain verifies.
    const version = must(
      await user.client
        .from("contract_versions")
        .select("status")
        .eq("id", versionId)
        .single(),
    );
    expect(version.status).toBe("executed");
    const orders = must(
      await user.client.from("orders").select("status, total_minor"),
    );
    expect(orders).toEqual([{ status: "created", total_minor: 89_177 }]);
    const events = must(
      await user.client
        .from("ledger_events")
        .select("type")
        .eq("plan_id", planId)
        .order("seq"),
    );
    expect(events.map((e) => e.type)).toEqual([
      "contract.signed",
      "execution.started",
      "payment.authorized",
      "order.created",
    ]);
    const broken = await admin.rpc("srv_verify_ledger", { p_plan_id: planId });
    expect(broken.error).toBeNull();
    expect(broken.data).toBeNull();
  });

  it.each([
    ["reapprove", 89_605, "material_change"],
    ["block", 88_107, "material_change"],
    ["auto", 91_001, "over_max_total"],
  ] as const)(
    "rejects a %s diff at %i with %s",
    async (classification, total, code) => {
      const versionId = await signedContract(user, planId);
      const diffId = await consentDiff(versionId, classification, total);
      const result = await admin.rpc("srv_begin_execution", {
        p_version: versionId,
        p_idem: `idem-${randomUUID()}`,
        p_diff: diffId,
      });
      expect(result.error?.message).toBe(code);
    },
  );

  it("is closed to signed-in users", async () => {
    const versionId = await signedContract(user, planId);
    const diffId = await consentDiff(versionId, "identical", 89_605);
    const result = await user.client.rpc("srv_begin_execution", {
      p_version: versionId,
      p_idem: `idem-${randomUUID()}`,
      p_diff: diffId,
    });
    expect(result.error?.code).toBe("42501");
  });
});
