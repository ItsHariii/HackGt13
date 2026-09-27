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

// Post-purchase over the Data API (0016_post_purchase.sql, TASKS T15.1, T15.3).
describe("Evidence Packs and delivery matches", () => {
  let user: TestUser;
  let other: TestUser;
  let planId: string;
  let orderId: string;

  beforeAll(async () => {
    [user, other] = await Promise.all([createUser(), createUser()]);
    planId = await createPlan(user);
    const versionId = await signedContract(user, planId);
    const diffId = await consentDiff(versionId, "identical", 89_605);
    const executionId = must(
      await admin.rpc("srv_begin_execution", {
        p_version: versionId,
        p_idem: `idem-${randomUUID()}`,
        p_diff: diffId,
      }),
    );
    must(
      await admin.rpc("srv_consume_execution_token", {
        p_execution: executionId,
      }),
    );
    must(
      await admin.rpc("srv_complete_execution", {
        p_execution: executionId,
        p_status: "authorized",
        p_rail_ref: "txn_test",
        p_merchant_id: "greathub",
        p_merchant_order_id: `dm_ord_${randomUUID().replaceAll("-", "")}`,
      }),
    );
    orderId = must(
      await admin
        .from("orders")
        .select("id")
        .eq("execution_id", executionId)
        .single(),
    ).id;
  });
  afterAll(() => deleteUsers([user, other]));

  it("queues an Evidence Pack for every new order", async () => {
    const messages = must(
      await admin.rpc("srv_queue_read", {
        p_queue: "q_evidence_pack",
        p_vt: 1,
        p_qty: 100,
      }),
    ) as unknown as { message: { orderId?: string } }[];
    expect(messages.map((m) => m.message.orderId)).toContain(orderId);
  });

  it("records a pack at the owner's path and ledgers it", async () => {
    const bad = await admin.rpc("srv_record_evidence_pack", {
      p_order: orderId,
      p_path: `${other.id}/${orderId}.zip`,
      p_sha256: `sha256:${"a".repeat(64)}`,
    });
    expect(bad.error?.message).toBe("evidence_pack_path_invalid");

    const sha = `sha256:${"b".repeat(64)}`;
    const pack = must(
      await admin.rpc("srv_record_evidence_pack", {
        p_order: orderId,
        p_path: `${user.id}/${orderId}.zip`,
        p_sha256: sha,
      }),
    );
    expect(pack.order_id).toBe(orderId);

    // The owner sees the row through RLS; nobody else does.
    const mine = must(
      await user.client
        .from("evidence_packs")
        .select("sha256")
        .eq("order_id", orderId),
    );
    expect(mine).toEqual([{ sha256: sha }]);
    const theirs = must(await other.client.from("evidence_packs").select("id"));
    expect(theirs).toEqual([]);

    const last = must(
      await user.client
        .from("ledger_events")
        .select("actor,type,payload")
        .eq("plan_id", planId)
        .order("seq", { ascending: false })
        .limit(1)
        .single(),
    );
    expect(last).toMatchObject({
      actor: "worker:evidence",
      type: "evidence_pack.generated",
      payload: { orderId, sha256: sha, packId: pack.id },
    });
  });

  it("ledgers a delivery match as the owner, and only the owner", async () => {
    const payload = {
      gtin: "00812345000108",
      sku: "M27Q-USBC",
      role: "monitor",
      method: "scan",
    };
    const theirs = await admin.rpc("srv_record_delivery", {
      p_order: orderId,
      p_user: other.id,
      p_type: "delivery.matched",
      p_payload: payload,
    });
    expect(theirs.error?.message).toBe("order_not_found");

    const badType = await admin.rpc("srv_record_delivery", {
      p_order: orderId,
      p_user: user.id,
      p_type: "order.created",
      p_payload: payload,
    });
    expect(badType.error?.message).toBe("delivery_type_invalid");

    const badGtin = await admin.rpc("srv_record_delivery", {
      p_order: orderId,
      p_user: user.id,
      p_type: "delivery.mismatched",
      p_payload: { gtin: "123" },
    });
    expect(badGtin.error?.message).toBe("delivery_payload_invalid");

    const matched = must(
      await admin.rpc("srv_record_delivery", {
        p_order: orderId,
        p_user: user.id,
        p_type: "delivery.matched",
        p_payload: payload,
      }),
    );
    expect(matched).toMatchObject({
      actor: `user:${user.id}`,
      type: "delivery.matched",
      payload: { ...payload, orderId },
    });
    must(
      await admin.rpc("srv_record_delivery", {
        p_order: orderId,
        p_user: user.id,
        p_type: "delivery.mismatched",
        p_payload: {
          gtin: "04006381333931",
          method: "typed",
          checkDigitOk: true,
        },
      }),
    );

    const broken = await admin.rpc("srv_verify_ledger", { p_plan_id: planId });
    expect(broken.error).toBeNull();
    expect(broken.data).toBeNull();
  });

  it("is closed to signed-in users", async () => {
    const pack = await user.client.rpc("srv_record_evidence_pack", {
      p_order: orderId,
      p_path: `${user.id}/${orderId}.zip`,
      p_sha256: `sha256:${"c".repeat(64)}`,
    });
    expect(pack.error).not.toBeNull();
    const delivery = await user.client.rpc("srv_record_delivery", {
      p_order: orderId,
      p_user: user.id,
      p_type: "delivery.matched",
      p_payload: { gtin: "00812345000108" },
    });
    expect(delivery.error).not.toBeNull();
  });
});
