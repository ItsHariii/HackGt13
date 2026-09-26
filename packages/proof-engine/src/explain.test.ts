import {
  EVIDENCE_STATES,
  type ProofResult,
  ReasonCode,
} from "@cartel/contracts";
import { describe, expect, it } from "vitest";
import {
  explain,
  formatDate,
  formatMoneyText,
  formatTarget,
  formatValue,
} from "./explain";
import { readAs, resolveJsonLdPath } from "./jsonld";

const PD = { kind: "power", label: "USB-C power" } as const;

function result(r: Partial<ProofResult>): ProofResult {
  return {
    requirementId: "r_usb_pd",
    scope: { kind: "item", role: "monitor", offerId: "o1" },
    importance: "hard",
    verdict: "pass",
    observed: { value: 90, unit: "W", qualifier: "up_to" },
    target: { op: "gte", value: { value: 65, unit: "W" } },
    evidenceState: "source_stated",
    factIds: ["f1"],
    reason: null,
    ...r,
  };
}

describe("formatting", () => {
  it("formats values the way the UI and Evidence Pack show them", () => {
    expect(formatValue({ value: 90, unit: "W", qualifier: "up_to" })).toBe(
      "up to 90 W",
    );
    expect(formatValue({ value: 20_000, unit: "mAh" })).toBe("20,000 mAh");
    expect(formatValue({ value: 3.4, unit: "fl_oz" })).toBe("3.4 fl oz");
    expect(formatValue({ value: 90, unit: "pct" })).toBe("90%");
    expect(formatValue({ amountMinor: 89_605, currency: "USD" })).toBe(
      "$896.05",
    );
    expect(formatValue({ dims: [21.5, 14, 9], unit: "in" })).toBe(
      "21.5 × 14 × 9 in",
    );
    expect(
      formatValue({
        min: { value: 100, unit: "V" },
        max: { value: 240, unit: "V" },
      }),
    ).toBe("100 V to 240 V");
    expect(formatValue("2026-09-28")).toBe("Mon Sep 28");
    expect(formatValue(["G", "C"])).toBe("G, C");
    expect(formatValue([])).toBe("none");
    expect(formatValue(false)).toBe("no");
    expect(formatValue(null)).toBe("nothing");
    expect(formatMoneyText(123_456_78, "EUR")).toBe("€123,456.78");
    expect(formatMoneyText(500, "CHF")).toBe("5.00 CHF");
    expect(formatDate("2026-10-09T18:00:00Z")).toBe("Fri Oct 9");
    expect(
      formatTarget("between", {
        min: { value: 35.5, unit: "in" },
        max: { value: 36.5, unit: "in" },
      }),
    ).toBe("between 35.5 in and 36.5 in");
  });
});

describe("explain", () => {
  it("attributes claims and never says Confirmed without a verified fact and its age", () => {
    expect(explain(result({}), { def: PD, source: "Manufacturer" })).toBe(
      "USB-C power: Manufacturer says up to 90 W, which meets at least 65 W.",
    );
    expect(
      explain(result({ evidenceState: "verified" }), {
        def: PD,
        source: "Icecat",
      }),
    ).toBe("USB-C power: Icecat says up to 90 W, which meets at least 65 W.");
    expect(
      explain(result({ evidenceState: "verified" }), {
        def: PD,
        source: "Icecat",
        ageSeconds: 7_200,
      }),
    ).toBe(
      "USB-C power: up to 90 W (Confirmed · Icecat · 2 h ago), which meets at least 65 W.",
    );
    expect(
      explain(
        result({
          verdict: "fail",
          reason: "not_satisfied",
          observed: { value: 15, unit: "W" },
        }),
        { def: PD, source: "GreatHub" },
      ),
    ).toBe(
      "USB-C power: GreatHub says 15 W, which doesn't meet at least 65 W.",
    );
    expect(
      explain(
        result({
          verdict: "unknown",
          reason: "insufficient_evidence",
          evidenceState: "supported",
        }),
        {
          def: PD,
          minStateToPass: "source_stated",
        },
      ),
    ).toBe(
      "USB-C power: up to 90 W would meet at least 65 W, but it rests on indirect evidence and this rule needs a source's own claim.",
    );
  });

  it("says unknowns plainly, for every reason code", () => {
    const W15 = { value: 15, unit: "W" } as const;
    const say = (
      reason: ReasonCode,
      observed: ProofResult["observed"] = null,
    ) =>
      explain(
        result({
          verdict: "unknown",
          reason,
          evidenceState: "unknown",
          observed,
        }),
        { def: PD },
      );
    expect(say("no_fact")).toBe("USB-C power: no source states this.");
    expect(say("stale")).toBe("USB-C power: the information is out of date.");
    expect(say("stale", W15)).toBe(
      "USB-C power: the last reading (15 W) is out of date.",
    );
    expect(say("conflict")).toBe(
      "USB-C power: sources disagree, so it can't be checked.",
    );
    expect(say("subjective")).toBe(
      "USB-C power is subjective, so it can't be checked.",
    );
    expect(say("role_missing")).toBe("Nothing is chosen for the monitor yet.");
    expect(
      say("total_mismatch", { amountMinor: 89_605, currency: "USD" }),
    ).toBe(
      "USB-C power: the store's total doesn't match the line items ($896.05 computed).",
    );
    expect(say("incomparable", { value: 65, unit: "Wh" })).toBe(
      "USB-C power: 65 Wh can't be compared with at least 65 W.",
    );
  });

  it("never uses the banned words (SDD §17.3) in any verdict × state × reason", () => {
    const banned = /guarantee|\bsafe\b|authentic|will fit|verified comfort/i;
    for (const verdict of ["pass", "fail", "unknown"] as const) {
      for (const evidenceState of EVIDENCE_STATES) {
        for (const reason of [null, ...ReasonCode.options]) {
          const text = explain(result({ verdict, evidenceState, reason }), {
            def: PD,
            source: "GreatHub",
            ageSeconds: 30,
          });
          expect(text).not.toMatch(banned);
          if (evidenceState !== "verified")
            expect(text).not.toMatch(/Confirmed/);
        }
      }
    }
  });
});

describe("JSON-LD paths", () => {
  const doc = {
    offers: [{ price: "329.00", priceCurrency: "USD" }, { price: "319.00" }],
    additionalProperty: [
      { name: "Width", value: "46.5 in" },
      { name: "width", value: "duplicate" },
      {
        name: "Weight",
        value: { "@type": "QuantitativeValue", value: 18, unitCode: "KGM" },
      },
    ],
  };

  it("fans out over arrays and filters by property, case-insensitively", () => {
    expect(resolveJsonLdPath(doc, "offers.price")).toEqual([
      "329.00",
      "319.00",
    ]);
    expect(
      resolveJsonLdPath(doc, "additionalProperty[name=Width].value"),
    ).toEqual(["46.5 in", "duplicate"]);
    expect(
      resolveJsonLdPath(doc, "additionalProperty[name=Depth].value"),
    ).toEqual([]);
    expect(resolveJsonLdPath(doc, "nope.deeper")).toEqual([]);
    expect(resolveJsonLdPath(null, "offers")).toEqual([]);
  });

  it("reads raw text as the field's kind, or null", () => {
    expect(readAs("46.5 in", { kind: "length", label: "" })).toEqual({
      value: 46.5,
      unit: "in",
    });
    expect(readAs("46.5", { kind: "length", label: "", unit: "in" })).toEqual({
      value: 46.5,
      unit: "in",
    });
    expect(
      readAs("https://schema.org/True", { kind: "boolean", label: "" }),
    ).toBe(true);
    expect(readAs("maybe", { kind: "boolean", label: "" })).toBeNull();
    expect(readAs("329.00", { kind: "money", label: "" }, "USD")).toEqual({
      amountMinor: 32_900,
      currency: "USD",
    });
    expect(
      readAs("UHD", {
        kind: "enum",
        label: "",
        values: ["4k"],
        aliases: { uhd: "4k" },
      }),
    ).toBe("4k");
    expect(readAs("wool, cotton", { kind: "list", label: "" })).toEqual([
      "wool",
      "cotton",
    ]);
    expect(readAs("comfy", { kind: "subjective", label: "" })).toBeNull();
  });
});
