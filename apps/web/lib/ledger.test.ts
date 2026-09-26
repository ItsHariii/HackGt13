import { describe, expect, it } from "vitest";
import { chain, GENESIS, jsonbText, verifyChain } from "./ledger";

const events = [
  {
    actor: "user:5f0c7a52-3b8e-4d61-9a2f-1c6e8b4d7a90",
    type: "plan.created",
    createdAt: "2026-09-26T13:58:40.000000Z",
    payload: { title: "Home office" },
  },
  {
    actor: "system",
    type: "basket.solved",
    createdAt: "2026-09-26T14:01:30.000000Z",
    payload: { total_minor: 89605, items: 5 },
  },
];

describe("ledger chain", () => {
  it("prints payloads the way Postgres prints jsonb", () => {
    expect(jsonbText({ total_minor: 89605, items: 5 })).toBe(
      '{"items": 5, "total_minor": 89605}',
    );
    expect(jsonbText({ b: [1, "x"], a: { d: true, c: null } })).toBe(
      '{"a": {"c": null, "d": true}, "b": [1, "x"]}',
    );
  });

  it("links each entry to the one before, from the zero hash", async () => {
    const records = await chain("p1", events);
    expect(records.map((r) => r.seq)).toEqual([1, 2]);
    expect(records[0]?.prevHash).toBe(GENESIS);
    expect(records[1]?.prevHash).toBe(records[0]?.hash);
    expect(records[0]?.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(await verifyChain(records)).toEqual({ ok: true, entries: 2 });
  });

  it("finds an edited payload, a broken link and a gap", async () => {
    const records = await chain("p1", events);
    const [a, b] = records as [(typeof records)[0], (typeof records)[0]];
    expect(
      await verifyChain([a, { ...b, payloadText: '{"items": 4}' }]),
    ).toMatchObject({ ok: false, brokenSeq: 2, reason: "hash" });
    expect(await verifyChain([a, { ...b, prevHash: GENESIS }])).toMatchObject({
      ok: false,
      brokenSeq: 2,
      reason: "link",
    });
    expect(await verifyChain([b])).toMatchObject({
      ok: false,
      brokenSeq: 2,
      reason: "sequence",
    });
  });
});
