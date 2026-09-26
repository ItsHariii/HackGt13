import { apparel, homeOffice, travel } from "@cartel/rule-packs";
import { describe, expect, it } from "vitest";
import { locateQuote } from "../quote";
import { buildRequirements } from "../requirements";
import type { BriefAnalysis } from "../schemas";
import { httpError, scriptedModel, testRouter } from "../testing";
import { EVAL_CASES, type EvalCase } from "./cases";
import { type CaseScore, runEval, scoreCase, summarize } from "./score";

const PACKS = [homeOffice, apparel, travel];

/** What a perfect model would answer: every canonical reading, quoted. */
function oracle(c: EvalCase): BriefAnalysis {
  return {
    pack: c.pack,
    questions: [],
    requirements: c.hard.map((e) => ({
      field: e.field,
      role: e.role ?? null,
      op: e.op,
      value: e.value,
      importance: "hard",
      weight: null,
      quote: e.quote,
      rationale: "stated",
    })),
  };
}

describe("eval set (T9.6)", () => {
  it("has 20 briefs: 8 home office, 6 apparel, 6 travel, with unique ids", () => {
    const count = (pack: string) =>
      EVAL_CASES.filter((c) => c.pack === pack).length;
    expect([
      EVAL_CASES.length,
      count("home-office"),
      count("apparel"),
      count("travel"),
    ]).toEqual([20, 8, 6, 6]);
    expect(new Set(EVAL_CASES.map((c) => c.id)).size).toBe(20);
  });

  it.each(EVAL_CASES.map((c) => [c.id, c] as const))(
    "%s: every quote is in the brief",
    (_, c) => {
      for (const e of c.hard)
        expect(locateQuote(c.brief, e.quote), e.quote).not.toBeNull();
    },
  );

  it.each(EVAL_CASES.map((c) => [c.id, c] as const))(
    "%s: the canonical answer survives the A1 guards and scores 100%%",
    (_, c) => {
      const set = buildRequirements(oracle(c), {
        brief: c.brief,
        packs: PACKS,
      });
      expect(set.dropped).toEqual([]);
      const score = scoreCase(c, set, PACKS);
      expect(score).toMatchObject({
        expected: c.hard.length,
        actual: c.hard.length,
        fieldHits: c.hard.length,
        exactHits: c.hard.length,
        detectedPack: c.pack,
        missing: [],
        extra: [],
      });
    },
  );
});

describe("scoring", () => {
  const flagship = EVAL_CASES[0] as EvalCase;

  it("counts an unquoted draft as a miss: it lands as an assumption, not a hard rule", () => {
    const analysis = oracle(flagship);
    const [first, ...rest] = analysis.requirements;
    const set = buildRequirements(
      {
        ...analysis,
        requirements: [
          { ...(first as BriefAnalysis["requirements"][number]), quote: null },
          ...rest,
        ],
      },
      { brief: flagship.brief, packs: PACKS },
    );
    const score = scoreCase(flagship, set, PACKS);
    expect(score.fieldHits).toBe(flagship.hard.length - 1);
    expect(score.missing).toEqual(["basket.delivered_total"]);
  });

  it("separates field-level hits from exact hits", () => {
    const analysis = oracle(flagship);
    const set = buildRequirements(
      {
        ...analysis,
        requirements: analysis.requirements.map((r) =>
          r.field === "desk.width" ? { ...r, value: "52 in" } : r,
        ),
      },
      { brief: flagship.brief, packs: PACKS },
    );
    const score = scoreCase(flagship, set, PACKS);
    expect([score.fieldHits, score.exactHits]).toEqual([
      flagship.hard.length,
      flagship.hard.length - 1,
    ]);
  });

  it("micro-averages and applies the 0.9 target", () => {
    const perfect = (id: string, n: number): CaseScore => ({
      id,
      pack: "home-office",
      detectedPack: "home-office",
      expected: n,
      actual: n,
      fieldHits: n,
      exactHits: n,
      assumedExpected: 0,
      assumedHits: 0,
      missing: [],
      extra: [],
      dropped: 0,
      questions: 0,
      error: null,
      call: null,
    });
    expect(summarize([perfect("a", 5), perfect("b", 5)]).passed).toBe(true);
    const weak = { ...perfect("c", 10), fieldHits: 7, actual: 8 };
    const s = summarize([perfect("a", 5), weak]);
    expect(s.field.recall).toBeCloseTo(12 / 15);
    expect(s.field.precision).toBeCloseTo(12 / 13);
    expect(s.passed).toBe(false);
  });

  it("runs the set through the router and scores a failed call as zero hits", async () => {
    const cases = EVAL_CASES.slice(0, 2);
    const { router } = testRouter({
      models: {
        openai: scriptedModel([oracle(cases[0] as EvalCase), httpError(400)]),
        meta: scriptedModel([httpError(400)]),
      },
    });
    const { scores, summary } = await runEval(router, cases, {
      packs: PACKS,
      concurrency: 1,
    });
    expect(scores[0]?.fieldHits).toBe(cases[0]?.hard.length);
    expect(scores[1]).toMatchObject({ fieldHits: 0, actual: 0, call: null });
    expect(scores[1]?.error).toMatch(/http_400/);
    expect(summary.errors).toBe(1);
  });
});
