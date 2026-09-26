import type { RealtimeChannel } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  admin,
  createPlan,
  createUser,
  deleteUsers,
  must,
  type TestUser,
} from "./fixtures";

function join(
  channel: RealtimeChannel,
): Promise<"SUBSCRIBED" | "CHANNEL_ERROR" | "TIMED_OUT"> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve("TIMED_OUT"), 10_000);
    channel.subscribe((state) => {
      if (state === "SUBSCRIBED" || state === "CHANNEL_ERROR") {
        clearTimeout(timer);
        resolve(state);
      }
    });
  });
}

describe("private plan broadcasts", () => {
  let owner: TestUser;
  let other: TestUser;
  let planId: string;

  beforeAll(async () => {
    [owner, other] = [await createUser(), await createUser()];
    planId = await createPlan(owner);
  });
  afterAll(() => deleteUsers([owner, other]));

  it("streams ledger events to the owner only", async () => {
    const channel = owner.client.channel(`plan:${planId}`, {
      config: { private: true },
    });
    let deliver: (payload: Record<string, unknown>) => void = () => {};
    const received = new Promise<Record<string, unknown>>((resolve) => {
      deliver = resolve;
    });
    channel.on("broadcast", { event: "ledger_event" }, ({ payload }) =>
      deliver(payload),
    );
    expect(await join(channel)).toBe("SUBSCRIBED");

    const intruder = other.client.channel(`plan:${planId}`, {
      config: { private: true },
    });
    expect(await join(intruder)).toBe("CHANNEL_ERROR");

    must(
      await admin.rpc("srv_ledger_append", {
        p_plan_id: planId,
        p_actor: "system",
        p_type: "plan.created",
        p_payload: { source: "db-test" },
      }),
    );
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error("ledger_event broadcast missing")),
        5_000,
      );
    });
    try {
      expect(await Promise.race([received, timeout])).toMatchObject({
        seq: 1,
        type: "plan.created",
        actor: "system",
      });
    } finally {
      clearTimeout(timer);
    }
  });
});
