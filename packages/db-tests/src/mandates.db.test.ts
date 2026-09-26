import { randomUUID } from "node:crypto";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  admin,
  createPlan,
  createUser,
  deleteUsers,
  must,
  sha256,
  type TestUser,
} from "./fixtures";

function join(channel: RealtimeChannel) {
  return new Promise<string>((resolve) => {
    const timer = setTimeout(() => resolve("TIMED_OUT"), 10_000);
    channel.subscribe((state) => {
      if (state === "SUBSCRIBED" || state === "CHANNEL_ERROR") {
        clearTimeout(timer);
        resolve(state);
      }
    });
  });
}

/** A signed contract whose body carries the flagship mandate. */
async function signedWithMandate(user: TestUser, planId: string) {
  const contractId = randomUUID();
  const versionId = randomUUID();
  const body = {
    contractId,
    version: 1,
    economics: { currency: "USD", maxTotalMinor: 91_000 },
    mandate: {
      trigger: { type: "price_lte", sku: "U2727", amountMinor: 32_000 },
      notAfter: new Date(Date.now() + 86_400_000).toISOString(),
    },
  };
  const hash = sha256(JSON.stringify(body));
  must(
    await admin
      .from("contracts")
      .insert({ id: contractId, plan_id: planId })
      .select("id")
      .single(),
  );
  must(
    await admin
      .from("contract_versions")
      .insert({
        id: versionId,
        contract_id: contractId,
        plan_id: planId,
        version: 1,
        body,
        body_hash: hash,
        status: "awaiting_signature",
        autonomy: { preset: "balanced" },
        expires_at: new Date(Date.now() + 2 * 86_400_000).toISOString(),
      })
      .select("id")
      .single(),
  );
  must(
    await admin
      .from("contract_signatures")
      .insert({
        contract_version_id: versionId,
        credential_public_key: "\\x01",
        body_hash: hash,
        challenge: `ct1:${hash}:${randomUUID()}`,
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
  return versionId;
}

describe("standing mandates over the Data API", () => {
  let owner: TestUser;
  let other: TestUser;
  let planId: string;

  beforeAll(async () => {
    [owner, other] = [await createUser(), await createUser()];
    planId = await createPlan(owner);
  });
  afterAll(() => deleteUsers([owner, other]));

  it("scopes contract versions to their owner through contracts -> plans", async () => {
    const versionId = await signedWithMandate(owner, planId);
    // The same embed the checkout and mandate loaders use.
    const select = "id,contracts!inner(plans!inner(user_id))";
    const mine = await admin
      .from("contract_versions")
      .select(select)
      .eq("id", versionId)
      .eq("contracts.plans.user_id", owner.id)
      .maybeSingle();
    expect(mine.error).toBeNull();
    expect(mine.data?.contracts.plans.user_id).toBe(owner.id);
    const theirs = await admin
      .from("contract_versions")
      .select(select)
      .eq("id", versionId)
      .eq("contracts.plans.user_id", other.id)
      .maybeSingle();
    expect(theirs.error).toBeNull();
    expect(theirs.data).toBeNull();
  });

  it("arms from the signed body, broadcasts to the owner, and cancels back to signed", async () => {
    const versionId = await signedWithMandate(owner, planId);
    const channel = owner.client.channel(`user:${owner.id}`, {
      config: { private: true },
    });
    const events: Record<string, unknown>[] = [];
    channel.on("broadcast", { event: "mandate" }, ({ payload }) =>
      events.push(payload),
    );
    expect(await join(channel)).toBe("SUBSCRIBED");
    const intruder = other.client.channel(`user:${owner.id}`, {
      config: { private: true },
    });
    expect(await join(intruder)).toBe("CHANNEL_ERROR");

    const mandate = must(
      await admin.rpc("srv_arm_mandate", {
        p_version: versionId,
        p_actor: `user:${owner.id}`,
      }),
    );
    expect(mandate.trigger).toEqual({
      type: "price_lte",
      sku: "U2727",
      amountMinor: 32_000,
    });

    // The owner reads their mandate through RLS; the worker's loader shape resolves.
    const seen = must(
      await owner.client
        .from("mandates")
        .select("id,status")
        .eq("id", mandate.id),
    );
    expect(seen).toEqual([{ id: mandate.id, status: "armed" }]);
    const loaded = must(
      await admin
        .from("mandates")
        .select(
          "id,contract_versions!inner(id,status,contracts!inner(plans!inner(user_id)))",
        )
        .eq("id", mandate.id)
        .single(),
    );
    expect(loaded.contract_versions.status).toBe("armed");
    expect(loaded.contract_versions.contracts.plans.user_id).toBe(owner.id);

    const fired = must(
      await admin.rpc("srv_record_mandate", {
        p_mandate: mandate.id,
        p_kind: "settled",
        p_status: "fired_blocked",
        p_outcome: { status: "paused", classification: "block" },
      }),
    );
    expect(fired.status).toBe("fired_blocked");
    const cancel = await admin.rpc("srv_cancel_mandate", {
      p_mandate: mandate.id,
      p_actor: `user:${owner.id}`,
    });
    expect(cancel.error?.message).toBe("mandate_not_armed");

    const deadline = Date.now() + 5_000;
    while (events.length < 2 && Date.now() < deadline)
      await new Promise((r) => setTimeout(r, 50));
    expect(events.map((e) => e.status)).toEqual(["armed", "fired_blocked"]);
    expect(events[1]).toMatchObject({
      mandateId: mandate.id,
      planId,
      outcome: { status: "paused" },
    });

    const second = await signedWithMandate(owner, planId);
    const m2 = must(
      await admin.rpc("srv_arm_mandate", {
        p_version: second,
        p_actor: `user:${owner.id}`,
      }),
    );
    must(
      await admin.rpc("srv_cancel_mandate", {
        p_mandate: m2.id,
        p_actor: `user:${owner.id}`,
      }),
    );
    const version = must(
      await owner.client
        .from("contract_versions")
        .select("status")
        .eq("id", second)
        .single(),
    );
    expect(version.status).toBe("signed");
  });
});
