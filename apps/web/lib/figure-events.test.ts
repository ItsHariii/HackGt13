import { describe, expect, it } from "vitest";
import {
  addProofResult,
  applySearchChunk,
  EMPTY_PROOF,
  type ProofResultEvent,
  proofAnnouncement,
  searchAnnouncement,
  splitLines,
  startSearch,
} from "./figure-events";

const result = (
  id: string,
  verdict: ProofResultEvent["verdict"],
  reportId = "r1",
): ProofResultEvent => ({
  id,
  reportId,
  requirementId: `req-${id}`,
  scope: "basket",
  verdict,
  state: "confirmed",
  reason: verdict === "unknown" ? "no evidence" : null,
});

describe("proof stream", () => {
  it("counts verdicts and ignores duplicates", () => {
    let s = EMPTY_PROOF;
    for (const r of [
      result("a", "pass"),
      result("b", "fail"),
      result("a", "pass"),
      result("c", "unknown"),
    ])
      s = addProofResult(s, r);
    expect(s).toMatchObject({
      pass: 1,
      fail: 1,
      unknown: 1,
      latest: { id: "c" },
    });
    expect(s.results).toHaveLength(3);
  });

  it("starts over for a new report", () => {
    const s = addProofResult(
      addProofResult(EMPTY_PROOF, result("a", "fail")),
      result("x", "pass", "r2"),
    );
    expect(s).toMatchObject({ pass: 1, fail: 0, results: [{ id: "x" }] });
  });

  it("announces only the summary", () => {
    const s = addProofResult(
      addProofResult(EMPTY_PROOF, result("a", "pass")),
      result("b", "pass"),
    );
    expect(proofAnnouncement(s, 12)).toBe("2 of 12 checked…");
    expect(proofAnnouncement(s, 2)).toBe("2 of 2 hard rules pass.");
    expect(proofAnnouncement(addProofResult(s, result("c", "fail")))).toBe(
      "1 of 3 hard rules fail.",
    );
  });
});

describe("search status", () => {
  it("marks sources done, zero results included, and errors as errors", () => {
    let s = startSearch(["shopify", "upcitemdb", "greathub"]);
    s = applySearchChunk(s, {
      source: "shopify",
      status: "ok",
      products: [{}, {}] as never,
    });
    s = applySearchChunk(s, {
      source: "upcitemdb",
      status: "ok",
      products: [],
    });
    expect(searchAnnouncement(s)).toBe("Searching greathub…");
    s = applySearchChunk(s, {
      source: "greathub",
      status: "timeout",
      products: [],
    });
    expect(s.map((x) => x.state)).toEqual(["done", "done", "error"]);
    expect(searchAnnouncement(s)).toBe("All sources done: 2 results.");
  });

  it("splits NDJSON and keeps a partial line", () => {
    expect(splitLines('{"a":1}\n\n{"b":2}\n{"c"')).toEqual({
      lines: ['{"a":1}', '{"b":2}'],
      rest: '{"c"',
    });
  });
});
