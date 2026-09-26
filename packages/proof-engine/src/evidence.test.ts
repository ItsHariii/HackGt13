import {
  EVIDENCE_STATES,
  type EvidenceState,
  evidenceRank,
  type Fact,
} from "@cartel/contracts";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  atLeast,
  capState,
  derivedState,
  type ResolveContext,
  resolveFacts,
  strongest,
  weakest,
} from "./evidence";
import type { FieldDef } from "./fields";

const NOW = "2026-09-26T14:02:11Z";
const ctx: ResolveContext = {
  nowMs: Date.parse(NOW),
  sources: {
    s_mfr: { authority: "manufacturer" },
    s_merchant: { authority: "merchant" },
    s_catalog: { authority: "catalog" },
  },
};

const PD: FieldDef = {
  kind: "power",
  label: "USB-C power",
  authority: ["manufacturer"],
  freshness: "24h",
};

function fact(
  id: string,
  value: Fact["value"],
  extra: Partial<Fact> = {},
): Fact {
  return {
    id,
    subjectKind: "product",
    subjectId: "p1",
    field: "monitor.usb_c_pd_watts",
    value,
    state: "source_stated",
    conflict: false,
    sourceId: "s_merchant",
    extractor: "jsonld",
    retrievedAt: "2026-09-26T14:00:00Z",
    ...extra,
  };
}

const W = (value: number) => ({ value, unit: "W" as const });
const state = fc.constantFrom(...EVIDENCE_STATES);

describe("lattice", () => {
  it("orders verified > source_stated > supported > estimated > unknown", () => {
    expect(atLeast("verified", "source_stated")).toBe(true);
    expect(atLeast("estimated", "supported")).toBe(false);
    expect(weakest(["verified", "estimated", "source_stated"])).toBe(
      "estimated",
    );
    expect(strongest(["unknown", "supported"])).toBe("supported");
    expect(weakest([])).toBe("verified");
    expect(strongest([])).toBe("unknown");
  });

  it("caps but never raises", () => {
    expect(capState("verified", "estimated")).toBe("estimated");
    expect(capState("unknown", "estimated")).toBe("unknown");
    expect(capState("supported", undefined)).toBe("supported");
  });

  it("min is a meet: commutative, idempotent and below both inputs", () => {
    fc.assert(
      fc.property(state, state, (a, b) => {
        const m = weakest([a, b]);
        return (
          m === weakest([b, a]) &&
          weakest([a, a]) === a &&
          evidenceRank(m) <= evidenceRank(a) &&
          evidenceRank(m) <= evidenceRank(b)
        );
      }),
    );
  });

  it("derived state ≤ every input, and ≤ estimated with an assumption (invariant 9)", () => {
    fc.assert(
      fc.property(
        fc.array(state, { minLength: 1, maxLength: 6 }),
        fc.boolean(),
        (inputs, assumed) => {
          const d = derivedState(inputs, assumed);
          const belowInputs = inputs.every(
            (s) => evidenceRank(d) <= evidenceRank(s),
          );
          const capped =
            !assumed || evidenceRank(d) <= evidenceRank("estimated");
          return belowInputs && capped;
        },
      ),
    );
  });
});

describe("resolveFacts", () => {
  it("no facts → unknown (no_fact); subjective → unknown (subjective)", () => {
    expect(resolveFacts([], PD, ctx)).toMatchObject({
      state: "unknown",
      reason: "no_fact",
    });
    expect(
      resolveFacts(
        [fact("f1", true)],
        { kind: "subjective", label: "Comfort" },
        ctx,
      ),
    ).toMatchObject({
      state: "unknown",
      reason: "subjective",
      factIds: ["f1"],
    });
  });

  it("agreeing facts take the strongest state and keep every ID", () => {
    const r = resolveFacts(
      [
        fact("f2", W(90), { state: "supported" }),
        fact("f1", W(90), { sourceId: "s_mfr" }),
      ],
      PD,
      ctx,
    );
    expect(r).toMatchObject({
      value: W(90),
      state: "source_stated",
      conflict: false,
      factIds: ["f1", "f2"],
    });
  });

  it("a stale fact drops to unknown (stale) but keeps its last value", () => {
    const old = fact("f1", W(90), { retrievedAt: "2026-09-24T00:00:00Z" });
    expect(resolveFacts([old], PD, ctx)).toMatchObject({
      state: "unknown",
      reason: "stale",
      value: W(90),
    });
    const explicit = fact("f1", W(90), { freshUntil: "2026-09-26T14:02:10Z" });
    expect(resolveFacts([explicit], PD, ctx).reason).toBe("stale");
  });

  it("a disagreement is settled only by the pack's authority, and stays flagged", () => {
    const merchant = fact("f1", W(90));
    const mfr = fact("f2", W(65), { sourceId: "s_mfr" });
    expect(resolveFacts([merchant, mfr], PD, ctx)).toMatchObject({
      value: W(65),
      state: "source_stated",
      conflict: true,
      factIds: ["f1", "f2"],
    });
    const noAuthority = { ...PD, authority: [] };
    expect(resolveFacts([merchant, mfr], noAuthority, ctx)).toMatchObject({
      state: "unknown",
      reason: "conflict",
      conflict: true,
      value: null,
    });
    const catalog = fact("f3", W(60), { sourceId: "s_catalog" });
    expect(resolveFacts([merchant, catalog], PD, ctx).reason).toBe("conflict");
  });

  it("treats values within tolerance as agreeing", () => {
    const def: FieldDef = {
      kind: "length",
      label: "Width",
      tolerance: { value: 0.5, unit: "mm" },
    };
    const r = resolveFacts(
      [
        fact("f1", { value: 46.5, unit: "in" }),
        fact("f2", { value: 118.1, unit: "cm" }, { state: "supported" }),
      ],
      def,
      ctx,
    );
    expect(r).toMatchObject({ state: "source_stated", conflict: false });
  });

  it("caps at the field's maxState and at estimated for approx values", () => {
    const def: FieldDef = {
      kind: "date",
      label: "Delivery",
      maxState: "estimated",
    };
    expect(
      resolveFacts([fact("f1", "2026-09-28", { state: "verified" })], def, ctx)
        .state,
    ).toBe("estimated");
    const approx = fact(
      "f1",
      { value: 27, unit: "in", qualifier: "approx" },
      { state: "verified" },
    );
    expect(
      resolveFacts([approx], { kind: "length", label: "Diagonal" }, ctx).state,
    ).toBe("estimated");
  });

  it("does not depend on fact order", () => {
    const facts = [
      fact("f3", W(65), { sourceId: "s_mfr", state: "verified" }),
      fact("f1", W(90)),
      fact("f2", W(90), { state: "estimated" }),
    ];
    const a = resolveFacts(facts, PD, ctx);
    const b = resolveFacts([...facts].reverse(), PD, ctx);
    expect(a).toEqual(b);
  });

  it("an unknown fact passes its reason through", () => {
    const r = resolveFacts(
      [
        fact("f1", null, {
          state: "unknown",
          reason: "conflict",
          conflict: true,
        }),
      ],
      PD,
      ctx,
    );
    expect(r).toMatchObject({
      state: "unknown",
      reason: "conflict",
      conflict: true,
    });
  });

  it("never reports a usable state for an unknown input", () => {
    fc.assert(
      fc.property(state, (s: EvidenceState) => {
        const r = resolveFacts(
          [fact("f1", s === "unknown" ? null : W(1), { state: s })],
          PD,
          ctx,
        );
        return (s === "unknown") === (r.state === "unknown");
      }),
    );
  });
});
