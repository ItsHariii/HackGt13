import { describe, expect, it } from "vitest";
import anker from "../__fixtures__/cpsc-anker.json";
import { json, memoryStore, mockFetch } from "../test-utils";
import {
  type CpscRecall,
  createCpscAdapter,
  matchRecalls,
  recallClaim,
  recallLabel,
} from "./cpsc";

// Live response for ProductName=anker (2026-09-26): includes "Trankerloop", a substring false positive.
const RECALLS = anker as CpscRecall[];

describe("matchRecalls", () => {
  it("matches a recalled model named only in the description", () => {
    const r = matchRecalls(RECALLS, { brand: "Anker", model: "A1647" });
    expect(r.active).toBe(true);
    expect(r.matches.map((m) => m.recallNumber)).toContain("25011");
    expect(r.matches.every((m) => m.matchedBy === "model")).toBe(true);
  });

  it("does not match a longer or shorter model number", () => {
    expect(
      matchRecalls(RECALLS, { brand: "Anker", model: "A164" }).active,
    ).toBe(false);
    expect(
      matchRecalls(RECALLS, { brand: "Anker", model: "A16470" }).active,
    ).toBe(false);
  });

  it("requires the brand as a whole word (Trankerloop is not Anker)", () => {
    const r = matchRecalls(RECALLS, { brand: "Anker", model: "Z9999" });
    expect(r.active).toBe(false);
    expect(r.brandOnly).not.toContain("26288");
  });

  it("can't decide without a model when the brand has recalls", () => {
    const r = matchRecalls(RECALLS, { brand: "Anker" });
    expect(r.active).toBeNull();
    expect(recallClaim(r, "2026-09-26T10:00:00Z")).toMatchObject({
      value: null,
      state: "unknown",
      reason: "insufficient_evidence",
    });
  });

  it("matches by UPC regardless of brand spelling", () => {
    const recalls: CpscRecall[] = [
      {
        RecallNumber: "X1",
        Title: "Something",
        ProductUPCs: [{ UPC: "0812345000016" }],
      },
    ];
    expect(
      matchRecalls(recalls, {
        brand: "Other",
        model: null,
        gtin: "00812345000016",
      }).matches[0]?.matchedBy,
    ).toBe("gtin");
  });

  it("tolerates separators inside a model number", () => {
    const recalls: CpscRecall[] = [
      {
        RecallNumber: "R1",
        Title: "Vireo monitors",
        Description: "Model VP2785 4K stands",
      },
    ];
    expect(
      matchRecalls(recalls, { brand: "Vireo", model: "VP2785-4K" }).active,
    ).toBe(true);
  });
});

describe("recall fact and label", () => {
  it("a clean result is a verified false with a 24 h freshness and an 'as of' label, never 'safe'", () => {
    const check = matchRecalls(RECALLS, { brand: "Vireo", model: "U2727" });
    const c = recallClaim(check, "2026-09-26T10:42:00Z");
    expect(c).toMatchObject({
      field: "recall.active",
      value: false,
      state: "verified",
      freshUntil: "2026-09-27T10:42:00.000Z",
    });
    const label = recallLabel(check, new Date("2026-09-26T10:42:00Z"));
    expect(label).toBe("No recall found in CPSC as of 10:42 UTC");
    expect(label.toLowerCase()).not.toContain("safe");
  });
});

describe("CPSC adapter", () => {
  it("queries by brand, snapshots the response and can point at the demo mock", async () => {
    const { store, sources } = memoryStore();
    const { fetch, calls } = mockFetch(() => json(RECALLS));
    const cpsc = createCpscAdapter({
      store,
      fetch,
      baseUrl: "http://localhost:3001/api/mock-cpsc",
      label: "Mock CPSC (demo)",
    });
    const out = await cpsc.checkRecalls({ brand: "Anker", model: "A1652" });
    expect(calls[0]?.url).toBe(
      "http://localhost:3001/api/mock-cpsc?format=json&ProductName=Anker",
    );
    expect(out.check.active).toBe(true);
    expect(out.source.sourceType).toBe("cpsc");
    expect(sources).toHaveLength(1);
    // Second check within the hour is served from the snapshot.
    await cpsc.checkRecalls({ brand: "Anker", model: "A1652" });
    expect(calls).toHaveLength(1);
  });

  it("reports an outage as a source error, not as 'no recall'", async () => {
    const { store } = memoryStore();
    const { fetch } = mockFetch(() => new Response("oops", { status: 503 }));
    await expect(
      createCpscAdapter({ store, fetch }).checkRecalls({
        brand: "Anker",
        model: "A1652",
      }),
    ).rejects.toMatchObject({
      kind: "http",
      status: 503,
    });
  });
});
