import { describe, expect, it } from "vitest";
import { Basket, Fact, Offer } from "./catalog";
import { ConsentDiff, maxSeverity } from "./consent";
import {
  AutonomyPolicy,
  autonomyPolicy,
  ContractBody,
  MandateTrigger,
  ScopedPaymentGrant,
  signingChallenge,
} from "./contract";
import {
  FLAGSHIP_CONTRACT_V8,
  FLAGSHIP_REQUIREMENTS,
  VIREO_U2727_FACTS,
} from "./fixtures";
import { evidenceRank, Money, Quantity, Range, Value } from "./primitives";
import { ProofReport, ProofResult, summarize } from "./proof";
import {
  effectiveImportance,
  Requirement,
  RequirementPatch,
} from "./requirement";

const HASH = `sha256:${"a".repeat(64)}`;

function req(id: string): Requirement {
  const found = FLAGSHIP_REQUIREMENTS.find((r) => r.id === id);
  if (!found) throw new Error(id);
  return found;
}

function issues(result: {
  success: boolean;
  error?: { issues: { message: string }[] };
}) {
  return result.success
    ? []
    : (result.error?.issues.map((i) => i.message) ?? []);
}

describe("primitives", () => {
  it("orders evidence strongest first", () => {
    expect(evidenceRank("verified")).toBeGreaterThan(
      evidenceRank("source_stated"),
    );
    expect(evidenceRank("source_stated")).toBeGreaterThan(
      evidenceRank("supported"),
    );
    expect(evidenceRank("supported")).toBeGreaterThan(
      evidenceRank("estimated"),
    );
    expect(evidenceRank("estimated")).toBeGreaterThan(evidenceRank("unknown"));
  });

  it("keeps money in integer minor units", () => {
    expect(
      Money.safeParse({ amountMinor: 32900, currency: "USD" }).success,
    ).toBe(true);
    expect(
      Money.safeParse({ amountMinor: 329.5, currency: "USD" }).success,
    ).toBe(false);
    expect(
      Money.safeParse({ amountMinor: 2 ** 60, currency: "USD" }).success,
    ).toBe(false);
    expect(Money.safeParse({ amountMinor: 1, currency: "usd" }).success).toBe(
      false,
    );
  });

  it("preserves quantity qualifiers and rejects unknown units", () => {
    expect(
      Quantity.parse({ value: 90, unit: "W", qualifier: "up_to" }),
    ).toEqual({
      value: 90,
      unit: "W",
      qualifier: "up_to",
    });
    expect(Quantity.safeParse({ value: 90, unit: "watts" }).success).toBe(
      false,
    );
    expect(Quantity.safeParse({ value: Number.NaN, unit: "W" }).success).toBe(
      false,
    );
  });

  it("requires range ends of the same kind", () => {
    expect(
      Range.safeParse({
        min: { value: 100, unit: "V" },
        max: { value: 240, unit: "V" },
      }).success,
    ).toBe(true);
    expect(
      Range.safeParse({
        min: { value: 1, unit: "in" },
        max: { value: 30, unit: "mm" },
      }).success,
    ).toBe(true);
    expect(
      Range.safeParse({
        min: { value: 1, unit: "in" },
        max: { value: 3, unit: "W" },
      }).success,
    ).toBe(false);
    expect(
      Range.safeParse({
        min: { amountMinor: 1, currency: "USD" },
        max: { amountMinor: 3, currency: "EUR" },
      }).success,
    ).toBe(false);
  });

  it("does not let a quantity smuggle extra keys through the value union", () => {
    expect(Value.safeParse({ value: 1, unit: "W", note: "x" }).success).toBe(
      false,
    );
  });
});

describe("Requirement", () => {
  it("parses every flagship requirement", () => {
    for (const r of FLAGSHIP_REQUIREMENTS) Requirement.parse(r);
  });

  it("treats an unconfirmed AI assumption as a preference (SDD §7.2)", () => {
    const hardButUnconfirmed: Requirement = {
      ...req("r_usb_pd"),
      provenance: {
        kind: "ai_inferred",
        rationale: "MacBook",
        confirmed: false,
      },
    };
    expect(effectiveImportance(hardButUnconfirmed)).toBe("preference");
    expect(effectiveImportance(req("r_usb_pd"))).toBe("hard");
    expect(effectiveImportance(req("r_budget"))).toBe("hard");
  });

  it("enforces scope/role pairing", () => {
    const { role: _role, ...noRole } = req("r_desk_width");
    expect(issues(Requirement.safeParse(noRole))).toContain(
      "item scope needs a role",
    );
    expect(
      issues(
        Requirement.safeParse({ ...req("r_desk_width"), pairRole: "monitor" }),
      ),
    ).toContain("pairRole is required for pair scope and only for pair scope");
    expect(
      Requirement.safeParse({
        ...req("r_desk_width"),
        scope: "pair",
        role: "dock",
        pairRole: "monitor",
        field: "dock.video_compatible",
        op: "compatible_with",
        target: true,
      }).success,
    ).toBe(true);
  });

  it("allows weight on preferences only", () => {
    expect(
      issues(Requirement.safeParse({ ...req("r_budget"), weight: 0.5 })),
    ).toContain("weight applies to preferences only");
  });

  it("checks operator/target shape", () => {
    expect(
      Requirement.safeParse({ ...req("r_monitor_4k"), op: "in" }).success,
    ).toBe(false);
    expect(
      Requirement.safeParse({
        ...req("r_monitor_4k"),
        op: "in",
        target: ["4k", "5k"],
      }).success,
    ).toBe(true);
    expect(
      Requirement.safeParse({ ...req("r_desk_width"), op: "between" }).success,
    ).toBe(false);
  });

  it("rejects malformed field paths and inverted spans", () => {
    expect(
      Requirement.safeParse({ ...req("r_budget"), field: "Budget" }).success,
    ).toBe(false);
    expect(
      Requirement.safeParse({
        ...req("r_budget"),
        provenance: { kind: "user_stated", quote: "x", span: [5, 5] },
      }).success,
    ).toBe(false);
  });
});

describe("RequirementPatch", () => {
  it("accepts add, remove and non-empty replace", () => {
    RequirementPatch.parse({ op: "add", requirement: req("r_budget") });
    RequirementPatch.parse({ op: "remove", requirementId: "r_chair_lumbar" });
    RequirementPatch.parse({
      op: "replace",
      requirementId: "r_budget",
      set: { target: { amountMinor: 90_000, currency: "USD" } },
    });
    expect(
      RequirementPatch.safeParse({
        op: "replace",
        requirementId: "r_budget",
        set: {},
      }).success,
    ).toBe(false);
  });
});

describe("Fact", () => {
  it("requires a span for quoted facts", () => {
    const [f] = VIREO_U2727_FACTS;
    expect(Fact.safeParse({ ...f, quote: "up to 90 W" }).success).toBe(false);
    expect(
      Fact.safeParse({ ...f, quote: "up to 90 W", span: [10, 20] }).success,
    ).toBe(true);
  });

  it("caps facts derived with an assumption at estimated (SDD §7.3)", () => {
    const derived = {
      id: "f_wh",
      subjectKind: "product",
      subjectId: "dm_volt_20k",
      field: "power_bank.energy_wh",
      value: { value: 74, unit: "Wh" },
      state: "source_stated",
      conflict: false,
      sourceId: "src_volt",
      extractor: "derive:wh_from_mah",
      derivation: { inputs: ["f_mah"], assumptions: ["nominal 3.7 V"] },
      retrievedAt: "2026-09-26T14:00:00Z",
    };
    expect(Fact.safeParse(derived).success).toBe(false);
    expect(Fact.safeParse({ ...derived, state: "estimated" }).success).toBe(
      true,
    );
  });

  it("keeps a valueless fact unknown", () => {
    const [f] = VIREO_U2727_FACTS;
    expect(Fact.safeParse({ ...f, value: null }).success).toBe(false);
    expect(
      Fact.safeParse({ ...f, value: null, state: "unknown", reason: "no_fact" })
        .success,
    ).toBe(true);
  });
});

describe("Offer and Basket", () => {
  const offer = {
    id: "dm_off_48300",
    productId: "dm_vireo_u2727",
    merchant: "greathub",
    sellerId: "dm_seller_1",
    sku: "U2727",
    gtin: "00812345000024",
    title: 'Vireo U2727 27" 4K USB-C',
    price: { amountMinor: 32_900, currency: "USD" },
    availability: "in_stock",
    deliveryBy: "2026-09-28",
    terms: { finalSale: false, returnWindowDays: 30, returnFeeMinor: 0 },
    tier: "full",
  };

  it("parses an offer", () => {
    Offer.parse(offer);
    expect(Offer.safeParse({ ...offer, gtin: "123" }).success).toBe(false);
  });

  it("rejects duplicate basket lines", () => {
    const line = { role: "monitor", offerId: "dm_off_48300", qty: 1 };
    expect(Basket.safeParse({ id: "b1", lines: [line] }).success).toBe(true);
    expect(Basket.safeParse({ id: "b1", lines: [line, line] }).success).toBe(
      false,
    );
  });
});

describe("ProofReport", () => {
  const pass: ProofResult = {
    requirementId: "r_usb_pd",
    scope: { kind: "item", role: "monitor", offerId: "dm_off_48300" },
    importance: "hard",
    verdict: "pass",
    observed: { value: 90, unit: "W", qualifier: "up_to" },
    target: { op: "gte", value: { value: 65, unit: "W" } },
    evidenceState: "source_stated",
    factIds: ["f_9c1"],
    reason: null,
  };
  const comfort: ProofResult = {
    ...pass,
    requirementId: "r_chair_comfort",
    scope: { kind: "item", role: "chair", offerId: "dm_off_2" },
    verdict: "unknown",
    observed: null,
    target: { op: "exists", value: true },
    evidenceState: "unknown",
    factIds: [],
    reason: "subjective",
  };

  it("requires reasons exactly on non-pass verdicts", () => {
    expect(ProofResult.safeParse({ ...pass, reason: "stale" }).success).toBe(
      false,
    );
    expect(ProofResult.safeParse({ ...comfort, reason: null }).success).toBe(
      false,
    );
  });

  it("checks the summary against the results", () => {
    const results = [pass, comfort];
    const report = {
      schema: "cartel.report/1",
      engineVersion: "1.0.0",
      packs: { "home-office": "1.0.0" },
      evaluatedAt: "2026-09-26T14:02:11Z",
      summary: summarize(results),
      results,
      hash: HASH,
    };
    expect(report.summary).toEqual({
      hard: { pass: 1, fail: 0, unknown: 1 },
      preference: { met: 0, unmet: 0, unknown: 0 },
    });
    expect(ProofReport.safeParse(report).success).toBe(true);
    expect(
      ProofReport.safeParse({
        ...report,
        summary: { ...report.summary, hard: { pass: 2, fail: 0, unknown: 0 } },
      }).success,
    ).toBe(false);
  });
});

describe("ContractBody", () => {
  it("rejects unknown keys instead of stripping them (they would escape the hash)", () => {
    expect(
      ContractBody.safeParse({ ...FLAGSHIP_CONTRACT_V8, note: "x" }).success,
    ).toBe(false);
  });

  it("requires a parent hash exactly when version > 1", () => {
    expect(
      ContractBody.safeParse({ ...FLAGSHIP_CONTRACT_V8, parentHash: null })
        .success,
    ).toBe(false);
    expect(
      ContractBody.safeParse({
        ...FLAGSHIP_CONTRACT_V8,
        version: 1,
        parentHash: null,
      }).success,
    ).toBe(true);
  });

  it("checks economics against the items and the max total", () => {
    const e = FLAGSHIP_CONTRACT_V8.economics;
    expect(
      ContractBody.safeParse({
        ...FLAGSHIP_CONTRACT_V8,
        economics: { ...e, merchandiseMinor: e.merchandiseMinor + 1 },
      }).success,
    ).toBe(false);
    expect(
      ContractBody.safeParse({
        ...FLAGSHIP_CONTRACT_V8,
        economics: { ...e, maxTotalMinor: 87_036 },
      }).success,
    ).toBe(false);
  });

  it("rejects waivers for unknown requirements, and time travel", () => {
    expect(
      ContractBody.safeParse({
        ...FLAGSHIP_CONTRACT_V8,
        waivers: [
          {
            requirementId: "r_nope",
            acceptedState: "unknown",
            reason: "subjective",
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      ContractBody.safeParse({
        ...FLAGSHIP_CONTRACT_V8,
        expiresAt: FLAGSHIP_CONTRACT_V8.issuedAt,
      }).success,
    ).toBe(false);
  });

  it("carries the v7 mandate shape", () => {
    const v7Mandate = {
      trigger: { type: "price_lte", sku: "U2727", amountMinor: 32_000 },
      notAfter: "2026-09-28T04:00:00Z",
    };
    expect(
      ContractBody.safeParse({
        ...FLAGSHIP_CONTRACT_V8,
        mandate: v7Mandate,
        expiresAt: "2026-09-28T04:00:00Z",
      }).success,
    ).toBe(true);
    expect(
      ContractBody.safeParse({ ...FLAGSHIP_CONTRACT_V8, mandate: v7Mandate })
        .success,
    ).toBe(false);
    expect(
      MandateTrigger.safeParse({ type: "recurring", every: "P30D" }).success,
    ).toBe(true);
    expect(
      MandateTrigger.safeParse({ type: "recurring", every: "P" }).success,
    ).toBe(false);
  });
});

describe("AutonomyPolicy", () => {
  it("builds presets from SDD §7.6 and refuses to loosen them", () => {
    expect(autonomyPolicy("balanced").tolerances).toEqual({
      increasePct: 2,
      increaseMinor: 500,
    });
    expect(autonomyPolicy("flexible").tolerances).toEqual({
      increasePct: 5,
      increaseMinor: 2000,
    });
    expect(
      AutonomyPolicy.safeParse({
        preset: "balanced",
        tolerances: { increasePct: 1, increaseMinor: 100 },
      }).success,
    ).toBe(true);
    expect(
      AutonomyPolicy.safeParse({
        preset: "strict",
        tolerances: { increasePct: 2, increaseMinor: 500 },
      }).success,
    ).toBe(false);
  });
});

describe("ConsentDiff", () => {
  const webcamDrop = {
    kind: "economics",
    attribute: "unit_price",
    role: "webcam",
    beforeMinor: 4900,
    afterMinor: 4500,
    class: "auto",
    basis: "balanced.price_decrease",
  } as const;
  const dealTrap = {
    kind: "verdict",
    requirementId: "r_usb_pd",
    importance: "hard",
    before: "pass",
    after: "fail",
    class: "block",
    basis: "floor.hard_pass_to_fail",
  } as const;
  const diff = {
    schema: "cartel.diff/1",
    contractHash: HASH,
    classification: "block",
    changes: [webcamDrop, dealTrap],
    reproofHash: HASH,
    currentTotalMinor: 88_107,
    evaluatedAt: "2026-09-26T14:10:02Z",
  };

  it("takes the most severe change; info alone is identical", () => {
    expect(maxSeverity([])).toBe("identical");
    expect(maxSeverity(["info", "info"])).toBe("identical");
    expect(maxSeverity(["info", "auto"])).toBe("auto");
    expect(maxSeverity(["auto", "block", "reapprove"])).toBe("block");
  });

  it("parses the deal-trap diff and rejects an understated classification", () => {
    expect(ConsentDiff.safeParse(diff).success).toBe(true);
    expect(
      ConsentDiff.safeParse({ ...diff, classification: "auto" }).success,
    ).toBe(false);
  });

  it("keeps classified changes strict", () => {
    expect(
      ConsentDiff.safeParse({ ...diff, changes: [{ ...dealTrap, extra: 1 }] })
        .success,
    ).toBe(false);
  });
});

describe("ScopedPaymentGrant", () => {
  const grant = {
    iss: "https://cartel.example",
    aud: "https://greathub.example",
    sub: FLAGSHIP_CONTRACT_V8.subject,
    jti: "g_1",
    iat: 1_790_000_000,
    exp: 1_790_000_600,
    merchantId: "greathub",
    contractId: "c_flagship",
    contractVersion: 8,
    contractHash: HASH,
    executionId: "8f14e45f-ceea-467a-9b0e-2b1d3c4a5f60",
    maxTotalMinor: 88_500,
    currency: "USD",
    instrumentRef: "tms_pi_123",
  };

  it("expires within ten minutes", () => {
    expect(ScopedPaymentGrant.safeParse(grant).success).toBe(true);
    expect(
      ScopedPaymentGrant.safeParse({ ...grant, exp: grant.iat + 601 }).success,
    ).toBe(false);
    expect(
      ScopedPaymentGrant.safeParse({ ...grant, exp: grant.iat }).success,
    ).toBe(false);
  });
});

describe("signingChallenge", () => {
  it("embeds the bare hex hash and nonce (SDD §12.2)", () => {
    expect(signingChallenge(HASH, "n1")).toBe(`ct1:${"a".repeat(64)}:n1`);
  });
});

describe("URLs", () => {
  it("accepts only http(s) merchant origins", () => {
    for (const origin of [
      "javascript:alert(1)",
      "data:text/html,x",
      "ftp://x.example",
    ]) {
      expect(
        ContractBody.safeParse({
          ...FLAGSHIP_CONTRACT_V8,
          merchants: [{ id: "greathub", origin }],
        }).success,
      ).toBe(false);
    }
  });
});
