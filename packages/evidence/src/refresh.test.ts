import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  drainQueue,
  type QueueMessage,
  type QueueStore,
  verifyQueueWake,
} from "./refresh";

const SECRET = "test-hmac-secret";

function wake(ts: number, queue: string, secret = SECRET): Headers {
  // The same construction as internal.wake_worker in 0010_jobs.sql.
  const sig = createHmac("sha256", secret)
    .update(`${ts}.${queue}`)
    .digest("hex");
  return new Headers({
    "x-proofcart-timestamp": String(ts),
    "x-proofcart-signature": `v1=${sig}`,
  });
}

describe("verifyQueueWake", () => {
  const now = 1_790_000_000_000;
  const ts = now / 1000;

  it("accepts the database's signature for this queue", async () => {
    expect(
      await verifyQueueWake(
        wake(ts, "fact_refresh"),
        "fact_refresh",
        SECRET,
        now,
      ),
    ).toBe(true);
  });

  it("rejects another queue's signature, a wrong secret, and an old timestamp", async () => {
    expect(
      await verifyQueueWake(
        wake(ts, "mandate_eval"),
        "fact_refresh",
        SECRET,
        now,
      ),
    ).toBe(false);
    expect(
      await verifyQueueWake(
        wake(ts, "fact_refresh", "other"),
        "fact_refresh",
        SECRET,
        now,
      ),
    ).toBe(false);
    expect(
      await verifyQueueWake(
        wake(ts - 301, "fact_refresh"),
        "fact_refresh",
        SECRET,
        now,
      ),
    ).toBe(false);
    expect(
      await verifyQueueWake(new Headers(), "fact_refresh", SECRET, now),
    ).toBe(false);
    expect(
      await verifyQueueWake(wake(ts, "fact_refresh"), "fact_refresh", "", now),
    ).toBe(false);
  });
});

function memoryQueue(messages: QueueMessage[]) {
  const archived: number[] = [];
  const sent: { queue: string; message: unknown }[] = [];
  const q: QueueStore = {
    async read(_queue, _vt, qty) {
      return messages.splice(0, qty);
    },
    async send(queue, message) {
      sent.push({ queue, message });
    },
    async archive(_queue, id) {
      archived.push(id);
    },
  };
  return { q, archived, sent };
}

describe("drainQueue", () => {
  it("archives handled and skipped messages, leaves failures for retry, dead-letters after 5 reads", async () => {
    const { q, archived, sent } = memoryQueue([
      { msgId: 1, readCt: 1, message: { offerId: "a" } },
      { msgId: 2, readCt: 1, message: { offerId: "b" } },
      { msgId: 3, readCt: 2, message: { offerId: "boom" } },
      { msgId: 4, readCt: 6, message: { offerId: "poison" } },
    ]);
    const errors: number[] = [];
    const res = await drainQueue(
      q,
      "q_fact_refresh",
      async (m) => {
        const id = (m as { offerId: string }).offerId;
        if (id === "boom") throw new Error("DemoMart down");
        return id === "a" ? "handled" : "skipped";
      },
      { onError: (_e, m) => errors.push(m.msgId) },
    );
    expect(res).toEqual({ handled: 1, skipped: 1, failed: 1, deadLettered: 1 });
    expect(archived.sort()).toEqual([1, 2, 4]);
    expect(errors).toEqual([3]);
    expect(sent).toEqual([
      {
        queue: "q_fact_refresh_dlq",
        message: { original: { offerId: "poison" }, msgId: 4, readCt: 6 },
      },
    ]);
  });
});
