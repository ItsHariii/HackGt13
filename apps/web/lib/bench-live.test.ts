import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { LIVE_CASES, runLiveCase } = await import("./bench-live");

describe("live bench cases", () => {
  it("every case is caught by the real consent diff", async () => {
    const results = await Promise.all(LIVE_CASES.map((c) => runLiveCase(c.id)));
    expect(results.map((r) => [r.id, r.classification, r.caught])).toEqual([
      ["price_swap", expect.stringMatching(/block|reapprove/), true],
      ["spec_edit", "block", true],
      ["seller_swap", expect.stringMatching(/block|reapprove/), true],
      ["prompt_text", expect.stringMatching(/identical|auto/), true],
      ["benign_drop", "auto", true],
    ]);
  });
});
