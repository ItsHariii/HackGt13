import { forSession } from "@cartel/ai";
import {
  httpError,
  scriptedModel,
  streamingModel,
  testRouter,
} from "@cartel/ai/testing";
import { PACKS } from "@cartel/rule-packs";
import { describe, expect, it, vi } from "vitest";
import { briefDraftStream, type DraftLine } from "./brief-draft";

const BRIEF =
  "I need a home office setup under $1,000, delivered by Monday. The desk must fit a 48-inch alcove.";
const PLAN = {
  id: "7a1b2c3d-0000-4000-8000-000000000001",
  brief: BRIEF,
  packs: [PACKS["home-office"]].flatMap((p) => (p ? [p] : [])),
};

const ANALYSIS = {
  pack: "home-office",
  requirements: [
    {
      field: "basket.delivered_total",
      role: null,
      op: "lte",
      value: "$1,000",
      importance: "hard",
      weight: null,
      quote: "under $1,000",
      rationale: "Budget stated in the brief.",
    },
    {
      field: "desk.width",
      role: "desk",
      op: "lte",
      value: "48 in",
      importance: "hard",
      weight: null,
      quote: "48-inch alcove",
      rationale: "The alcove limits the desk width.",
    },
  ],
  questions: [
    {
      field: "desk.width",
      question:
        "Is 48 inches the desk's width only, or including a monitor arm?",
      why: "An arm can overhang the desk.",
    },
  ],
};

async function lines(stream: ReadableStream<Uint8Array>): Promise<DraftLine[]> {
  const text = await new Response(stream).text();
  return text
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as DraftLine);
}

describe("briefDraftStream", () => {
  it("streams partial drafts, then the final set with the matched pack", async () => {
    const { router } = testRouter({
      models: { openai: streamingModel(ANALYSIS, 12) },
    });
    const onPack = vi.fn(async () => {});
    const out = await lines(
      briefDraftStream(router, PLAN, { today: "2026-09-24", onPack }),
    );
    const done = out.at(-1);
    expect(done?.type).toBe("done");
    if (done?.type !== "done") return;
    expect(done.pack).toBe("home-office");
    expect(done.requirements.map((r) => r.field)).toEqual([
      "basket.delivered_total",
      "desk.width",
    ]);
    expect(
      done.requirements.every((r) => r.provenance.kind === "user_stated"),
    ).toBe(true);
    expect(done.questions).toHaveLength(1);
    expect(onPack).toHaveBeenCalledWith("home-office");
    // Partials only ever grow and never repeat a line.
    const counts = out
      .filter((l) => l.type === "partial")
      .map((l) => (l.type === "partial" ? l.requirements.length : 0));
    expect(counts).toEqual([...counts].sort((a, b) => a - b));
  });

  it("reports 'off' when the session has the AI switched off", async () => {
    const { router } = testRouter({
      models: { openai: streamingModel(ANALYSIS) },
    });
    const out = await lines(
      briefDraftStream(forSession(router, { aiOff: true }), PLAN),
    );
    expect(out).toEqual([{ type: "error", reason: "off" }]);
  });

  it("reports 'unavailable' when every provider fails", async () => {
    const failing = scriptedModel([httpError(500)]);
    failing.doStream = async () => {
      throw httpError(500);
    };
    const { router } = testRouter({
      models: { openai: failing, meta: failing },
      config: { retries: 0 },
    });
    const onError = vi.fn();
    const out = await lines(briefDraftStream(router, PLAN, { onError }));
    expect(out).toEqual([{ type: "error", reason: "unavailable" }]);
    expect(onError).toHaveBeenCalledOnce();
  });
});
