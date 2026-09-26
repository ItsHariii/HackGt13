import { fieldDef } from "@cartel/proof-engine";
import { homeOffice } from "@cartel/rule-packs";
import { describe, expect, it } from "vitest";
import {
  type FactStore,
  planFactWrites,
  StaleFactPlanError,
  writeFacts,
} from "./fact-store";
import { memoryStore } from "./test-utils";
import type { FactDraft } from "./types";

const defFor = (f: string) => fieldDef(f, [homeOffice]);
const NOW = new Date("2026-09-26T12:00:00Z");
const PD = "monitor.usb_c_pd_watts";

const draft = (over: Partial<FactDraft>): FactDraft => ({
  subjectKind: "product",
  subjectId: "prod-1",
  field: PD,
  value: { value: 90, unit: "W" },
  raw: "90 W",
  state: "source_stated",
  sourceId: "src-1",
  extractor: "jsonld",
  retrievedAt: "2026-09-26T11:59:00Z",
  freshUntil: "2026-09-27T11:59:00Z",
  ...over,
});

describe("planFactWrites", () => {
  it("supersedes the same extractor's previous reading only", () => {
    const current = [
      { ...draft({}), id: "f-jsonld", conflict: false },
      {
        ...draft({
          extractor: "icecat",
          sourceId: "src-ice",
          state: "verified",
        }),
        id: "f-ice",
        conflict: false,
      },
    ];
    const [g] = planFactWrites(current, [draft({ sourceId: "src-2" })], {
      defFor,
      now: NOW,
    });
    expect(g?.inserts).toHaveLength(1);
    expect(g?.inserts[0]?.supersedes).toEqual(["f-jsonld"]);
    expect(g?.expectedCurrent).toEqual(["f-ice", "f-jsonld"]);
    expect(g?.inserts[0]?.conflict).toBe(false);
  });

  it("is a no-op for an identical reading from the same snapshot", () => {
    const current = [{ ...draft({}), id: "f-1", conflict: false }];
    expect(planFactWrites(current, [draft({})], { defFor, now: NOW })).toEqual(
      [],
    );
  });

  it("flags every fresh reading when sources disagree (seller 15 W vs manufacturer 90 W)", () => {
    const current = [
      {
        ...draft({
          extractor: "icecat",
          sourceId: "src-ice",
          state: "verified",
        }),
        id: "f-ice",
        conflict: false,
      },
    ];
    const [g] = planFactWrites(
      current,
      [draft({ value: { value: 15, unit: "W" }, raw: "15 W" })],
      { defFor, now: NOW },
    );
    expect(g?.inserts[0]?.conflict).toBe(true);
    expect(g?.flagConflict).toEqual(["f-ice"]);
  });

  it("treats equal quantities in different units as agreement", () => {
    const current = [
      {
        ...draft({
          field: "monitor.diagonal",
          value: { value: 27, unit: "in" },
          extractor: "icecat",
        }),
        id: "f-ice",
        conflict: false,
      },
    ];
    const [g] = planFactWrites(
      current,
      [
        draft({
          field: "monitor.diagonal",
          value: { value: 68.58, unit: "cm" },
        }),
      ],
      { defFor, now: NOW },
    );
    expect(g?.inserts[0]?.conflict).toBe(false);
    expect(g?.flagConflict).toEqual([]);
  });

  it("ignores stale and unknown readings when looking for disagreement", () => {
    const current = [
      {
        ...draft({
          extractor: "icecat",
          value: { value: 15, unit: "W" },
          freshUntil: "2026-09-26T11:00:00Z",
        }),
        id: "f-stale",
        conflict: false,
      },
      {
        ...draft({
          extractor: "llm:fast@A3",
          value: null,
          state: "unknown",
          reason: "no_fact",
        }),
        id: "f-unknown",
        conflict: false,
      },
    ];
    const [g] = planFactWrites(current, [draft({})], { defFor, now: NOW });
    expect(g?.inserts[0]?.conflict).toBe(false);
    expect(g?.flagConflict).toEqual([]);
  });

  it("does not re-flag an already flagged fact", () => {
    const current = [
      {
        ...draft({ extractor: "icecat", value: { value: 15, unit: "W" } }),
        id: "f-ice",
        conflict: true,
      },
    ];
    const [g] = planFactWrites(current, [draft({})], { defFor, now: NOW });
    expect(g?.inserts[0]?.conflict).toBe(true);
    expect(g?.flagConflict).toEqual([]);
  });

  it("keeps only the last reading per extractor in one batch", () => {
    const [g] = planFactWrites([], [draft({ raw: "a" }), draft({ raw: "b" })], {
      defFor,
      now: NOW,
    });
    expect(g?.inserts.map((i) => i.draft.raw)).toEqual(["b"]);
  });
});

describe("writeFacts", () => {
  it("writes, supersedes and flags through the store", async () => {
    const { store, facts } = memoryStore();
    await writeFacts(
      store,
      [draft({ extractor: "icecat", state: "verified" })],
      { defFor, now: () => NOW },
    );
    const res = await writeFacts(
      store,
      [draft({ value: { value: 15, unit: "W" }, raw: "15 W" })],
      { defFor, now: () => NOW },
    );
    expect(res.conflicts).toEqual([`product:prod-1:${PD}`]);
    expect(facts.every((f) => f.conflict)).toBe(true);
    // A corrected seller page supersedes the bad reading; the old conflict stays on record.
    await writeFacts(store, [draft({ sourceId: "src-3" })], {
      defFor,
      now: () => NOW,
    });
    const current = facts.filter((f) => f.supersededBy === null);
    expect(current.map((f) => [f.extractor, f.conflict])).toEqual([
      ["icecat", true],
      ["jsonld", false],
    ]);
  });

  it("re-plans after losing a race, then gives up", async () => {
    const { store } = memoryStore();
    let losses = 1;
    const racy: FactStore = {
      currentFacts: store.currentFacts,
      async applyFactWrites(groups) {
        if (losses-- > 0) throw new StaleFactPlanError();
        return store.applyFactWrites(groups);
      },
    };
    expect(
      (await writeFacts(racy, [draft({})], { defFor, now: () => NOW }))
        .insertedIds,
    ).toHaveLength(1);
    losses = 10;
    await expect(
      writeFacts(racy, [draft({ raw: "x" })], {
        defFor,
        now: () => NOW,
        retries: 2,
      }),
    ).rejects.toBeInstanceOf(StaleFactPlanError);
  });
});
