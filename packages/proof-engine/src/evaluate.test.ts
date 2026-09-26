import {
  type Fact,
  type Offer,
  ProofReport,
  type Requirement,
} from "@proofcart/contracts";
import { describe, expect, it } from "vitest";
import {
  buildReport,
  ENGINE_VERSION,
  evaluate,
  evaluateResults,
  resultKey,
} from "./evaluate";
import { money } from "./money";
import { offerFacts } from "./offer-facts";
import { checkRequirements, definePack, PackError, packDefaults } from "./pack";
import { EngineInputError, type EvaluationInput } from "./view";

const NOW = "2026-09-26T12:00:00Z";

const kit = definePack({
  id: "test-kit",
  version: "0.1.0",
  title: "Test kit",
  fields: {
    "lamp.lumens": {
      kind: "count",
      label: "Brightness",
      authority: ["manufacturer"],
    },
    "lamp.height": { kind: "length", label: "Lamp height", unit: "in" },
    "bulb.base": { kind: "enum", label: "Bulb base", values: ["e26", "e12"] },
    "lamp.base": { kind: "enum", label: "Lamp socket", values: ["e26", "e12"] },
    "lamp.bulb_fits": { kind: "boolean", label: "Bulb fits" },
    "lamp.lumens_per_dollar": { kind: "count", label: "Lumens per dollar" },
  },
  roles: [
    { role: "lamp", label: "Lamp", required: true },
    { role: "bulb", label: "Bulb", required: false },
  ],
  pairs: [
    {
      id: "bulb_socket",
      roles: ["lamp", "bulb"],
      field: "lamp.bulb_fits",
      label: "Bulb fits",
      evaluate: (lamp, bulb) => {
        const a = lamp.get("lamp.base");
        const b = bulb.get("bulb.base");
        return typeof a.value === "string" && typeof b.value === "string"
          ? { value: a.value === b.value, from: [a, b] }
          : null;
      },
    },
  ],
  derive: [
    {
      id: "lumens_per_dollar",
      scope: "item",
      output: "lamp.lumens_per_dollar",
      inputs: ["lamp.lumens", "offer.price"],
      compute: (item) => {
        const lm = item.get("lamp.lumens");
        const price = item.get("offer.price");
        if (!lm.value || typeof lm.value !== "object" || !("value" in lm.value))
          return null;
        if (
          !price.value ||
          typeof price.value !== "object" ||
          !("amountMinor" in price.value)
        )
          return null;
        return {
          value: {
            value: Math.floor((lm.value.value * 100) / price.value.amountMinor),
            unit: "count",
          },
          from: [lm, price],
        };
      },
    },
  ],
  defaults: [
    {
      ruleId: "roles",
      build: () => ({
        scope: "basket",
        field: "basket.missing_roles",
        op: "eq",
        target: [],
        importance: "hard",
        minStateToPass: "verified",
        materiality: "on_verdict_change",
      }),
    },
  ],
});

function offer(
  id: string,
  merchant: string,
  priceMinor: number,
  extra: Partial<Offer> = {},
): Offer {
  return {
    id,
    productId: `p_${id}`,
    merchant,
    sellerId: `${merchant}_seller`,
    sku: id.toUpperCase(),
    title: id,
    price: money(priceMinor, "USD"),
    availability: "in_stock",
    deliveryBy: "2026-09-30",
    terms: { finalSale: false, returnWindowDays: 30, returnFeeMinor: 0 },
    tier: "full",
    ...extra,
  };
}

function spec(
  id: string,
  productId: string,
  field: string,
  value: Fact["value"],
): Fact {
  return {
    id,
    subjectKind: "product",
    subjectId: productId,
    field,
    value,
    state: "source_stated",
    conflict: false,
    sourceId: "src_jsonld",
    extractor: "jsonld",
    retrievedAt: NOW,
  };
}

function req(
  id: string,
  r: Omit<
    Requirement,
    "id" | "evidence" | "materiality" | "provenance" | "importance"
  > &
    Partial<Requirement>,
): Requirement {
  return {
    id,
    importance: "hard",
    evidence: { minStateToPass: "source_stated" },
    materiality: "on_verdict_change",
    provenance: { kind: "user_selected", via: "form", label: id },
    ...r,
  } as Requirement;
}

const lampA = offer("lamp_a", "shop_a", 4_000);
const lampB = offer("lamp_b", "shop_b", 6_000, { deliveryBy: "2026-10-02" });
const bulb = offer("bulb_1", "shop_a", 500);

function input(overrides: Partial<EvaluationInput> = {}): EvaluationInput {
  const offers = [lampA, lampB, bulb];
  return {
    requirements: [],
    basket: {
      id: "b1",
      lines: [
        { role: "lamp", offerId: "lamp_a", qty: 2 },
        { role: "lamp", offerId: "lamp_b", qty: 1 },
        { role: "bulb", offerId: "bulb_1", qty: 3 },
      ],
    },
    offers,
    facts: [
      spec("f_a_lm", "p_lamp_a", "lamp.lumens", { value: 800, unit: "count" }),
      spec("f_b_lm", "p_lamp_b", "lamp.lumens", { value: 400, unit: "count" }),
      spec("f_a_base", "p_lamp_a", "lamp.base", "e26"),
      spec("f_b_base", "p_lamp_b", "lamp.base", "e12"),
      spec("f_bulb_base", "p_bulb_1", "bulb.base", "e26"),
      ...offers.flatMap((o) =>
        offerFacts(o, { sourceId: "src_checkout", retrievedAt: NOW }),
      ),
    ],
    sources: {
      src_checkout: { authority: "merchant_checkout" },
      src_jsonld: { authority: "merchant" },
    },
    quotes: [
      {
        merchant: "shop_a",
        shipping: money(500, "USD"),
        tax: money(760, "USD"),
        state: "verified",
        factId: "q_a",
        retrievedAt: NOW,
      },
      {
        merchant: "shop_b",
        shipping: money(0, "USD"),
        tax: money(480, "USD"),
        state: "verified",
        factId: "q_b",
        retrievedAt: NOW,
      },
    ],
    order: { "order.substitutions_allowed": false },
    packs: [kit],
    now: NOW,
    ...overrides,
  };
}

describe("scopes", () => {
  it("item: one result per line of the role, role_missing when there is none", () => {
    const results = evaluateResults(
      input({
        requirements: [
          req("r_lm", {
            scope: "item",
            role: "lamp",
            field: "lamp.lumens",
            op: "gte",
            target: { value: 500, unit: "count" },
          }),
          req("r_shade", {
            scope: "item",
            role: "shade",
            field: "lamp.height",
            op: "lte",
            target: { value: 20, unit: "in" },
          }),
        ],
      }),
    );
    expect(
      results.map((r) => [r.requirementId, r.scope, r.verdict, r.reason]),
    ).toEqual([
      ["r_lm", { kind: "item", role: "lamp", offerId: "lamp_a" }, "pass", null],
      [
        "r_lm",
        { kind: "item", role: "lamp", offerId: "lamp_b" },
        "fail",
        "not_satisfied",
      ],
      [
        "r_shade",
        { kind: "item", role: "shade", offerId: null },
        "unknown",
        "role_missing",
      ],
    ]);
  });

  it("pair: every combination of the two roles, via the pack's pair rule", () => {
    const results = evaluateResults(
      input({
        requirements: [
          req("r_fit", {
            scope: "pair",
            role: "lamp",
            pairRole: "bulb",
            field: "lamp.bulb_fits",
            op: "compatible_with",
            target: true,
          }),
        ],
      }),
    );
    expect(results.map((r) => [r.scope, r.verdict, r.factIds])).toEqual([
      [
        {
          kind: "pair",
          roles: ["lamp", "bulb"],
          offerIds: ["lamp_a", "bulb_1"],
        },
        "pass",
        ["f_a_base", "f_bulb_base"],
      ],
      [
        {
          kind: "pair",
          roles: ["lamp", "bulb"],
          offerIds: ["lamp_b", "bulb_1"],
        },
        "fail",
        ["f_b_base", "f_bulb_base"],
      ],
    ]);
  });

  it("basket: totals from the lines (qty-aware) plus each store's shipping and tax", () => {
    const results = evaluateResults(
      input({
        requirements: [
          req("r_total", {
            scope: "basket",
            field: "basket.delivered_total",
            op: "lte",
            target: money(20_000, "USD"),
            evidence: { minStateToPass: "verified" },
          }),
          req("r_merch", {
            scope: "basket",
            field: "basket.merchandise_total",
            op: "eq",
            target: money(15_500, "USD"),
          }),
          req("r_stores", {
            scope: "basket",
            field: "basket.merchant_count",
            op: "lte",
            target: { value: 1, unit: "count" },
          }),
          req("r_by", {
            scope: "basket",
            field: "basket.delivery_latest",
            op: "lte",
            target: "2026-10-01",
            evidence: { minStateToPass: "estimated" },
          }),
        ],
      }),
    );
    const get = (id: string) => results.find((r) => r.requirementId === id);
    // 2 × 40 + 60 + 3 × 5 = 155; + 5 shipping + 7.60 + 4.80 tax = 172.40
    expect(get("r_total")).toMatchObject({
      verdict: "pass",
      observed: money(17_240, "USD"),
      evidenceState: "verified",
    });
    expect(get("r_merch")?.verdict).toBe("pass");
    expect(get("r_stores")).toMatchObject({
      verdict: "fail",
      observed: { value: 2, unit: "count" },
    });
    expect(get("r_by")).toMatchObject({
      verdict: "fail",
      observed: "2026-10-02",
      evidenceState: "estimated",
    });
    expect(get("r_total")?.factIds).toContain("q_a");
  });

  it("basket: a store total that doesn't match the lines is unknown (total_mismatch), never a pass", () => {
    const base = input();
    const quotes = (base.quotes ?? []).map((q) =>
      q.merchant === "shop_a"
        ? { ...q, total: money(9_999, "USD") }
        : { ...q, total: money(6_480, "USD") },
    );
    const results = evaluateResults({
      ...base,
      quotes,
      requirements: [
        req("r_total", {
          scope: "basket",
          field: "basket.delivered_total",
          op: "lte",
          target: money(20_000, "USD"),
        }),
      ],
    });
    expect(results[0]).toMatchObject({
      verdict: "unknown",
      reason: "total_mismatch",
      observed: money(17_240, "USD"),
    });
  });

  it("basket: a stale quote makes the total unknown (stale)", () => {
    const results = evaluateResults(
      input({
        now: "2026-09-26T12:05:00Z",
        requirements: [
          req("r_total", {
            scope: "basket",
            field: "basket.delivered_total",
            op: "lte",
            target: money(20_000, "USD"),
          }),
        ],
      }),
    );
    expect(results[0]).toMatchObject({ verdict: "unknown", reason: "stale" });
  });

  it("merchant: one result per store used, in store order", () => {
    const results = evaluateResults(
      input({
        requirements: [
          req("r_store", {
            scope: "merchant",
            field: "merchant.subtotal",
            op: "lte",
            target: money(8_000, "USD"),
          }),
        ],
      }),
    );
    expect(results.map((r) => [r.scope, r.verdict, r.observed])).toEqual([
      [{ kind: "merchant", merchant: "shop_a" }, "fail", money(9_500, "USD")],
      [{ kind: "merchant", merchant: "shop_b" }, "pass", money(6_000, "USD")],
    ]);
  });

  it("order: settings ProofCart sends are verified; missing ones are unknown", () => {
    const results = evaluateResults(
      input({
        requirements: [
          req("r_nosub", {
            scope: "order",
            field: "order.substitutions_allowed",
            op: "eq",
            target: false,
            evidence: { minStateToPass: "verified" },
          }),
          req("r_gift", {
            scope: "order",
            field: "order.gift_wrap",
            op: "eq",
            target: true,
          }),
        ],
      }),
    );
    expect(
      results.map((r) => [r.requirementId, r.verdict, r.evidenceState]),
    ).toEqual([
      ["r_gift", "unknown", "unknown"],
      ["r_nosub", "pass", "verified"],
    ]);
  });

  it("derives item values from facts, taking the weakest input's state", () => {
    const results = evaluateResults(
      input({
        requirements: [
          req("r_lpd", {
            scope: "item",
            role: "lamp",
            field: "lamp.lumens_per_dollar",
            op: "gte",
            target: { value: 10, unit: "count" },
            evidence: { minStateToPass: "estimated" },
          }),
        ],
      }),
    );
    expect(
      results.map((r) => [r.observed, r.evidenceState, r.factIds]),
    ).toEqual([
      [
        { value: 20, unit: "count" },
        "source_stated",
        ["f_a_lm", "lamp_a:price"],
      ],
      [
        { value: 6, unit: "count" },
        "source_stated",
        ["f_b_lm", "lamp_b:price"],
      ],
    ]);
  });

  it("missing roles come from the pack's role rules", () => {
    const [roles] = packDefaults(kit);
    const base = input();
    const onlyBulb = {
      ...base,
      basket: {
        id: "b2",
        lines: [{ role: "bulb", offerId: "bulb_1", qty: 1 }],
      },
    };
    const results = evaluateResults({
      ...onlyBulb,
      requirements: [roles as Requirement],
    });
    expect(results[0]).toMatchObject({
      verdict: "fail",
      observed: ["lamp"],
      evidenceState: "verified",
    });
  });
});

describe("report", () => {
  it("is schema-valid, versioned and hashed over everything but the hash", async () => {
    const report = await evaluate(
      input({
        requirements: [
          req("r_lm", {
            scope: "item",
            role: "lamp",
            field: "lamp.lumens",
            op: "gte",
            target: { value: 500, unit: "count" },
          }),
        ],
      }),
    );
    ProofReport.parse(report);
    expect(report).toMatchObject({
      engineVersion: ENGINE_VERSION,
      packs: { "test-kit": "0.1.0" },
      evaluatedAt: NOW,
    });
    expect(report.summary.hard).toEqual({ pass: 1, fail: 1, unknown: 0 });
    const rebuilt = await buildReport([...report.results].reverse(), {
      packs: [kit],
      now: NOW,
    });
    expect(rebuilt.hash).toBe(report.hash);
  });

  it("changes hash when a verdict changes", async () => {
    const r = [
      req("r_lm", {
        scope: "item",
        role: "lamp",
        field: "lamp.lumens",
        op: "gte",
        target: { value: 500, unit: "count" },
      }),
    ];
    const a = await evaluate(input({ requirements: r }));
    const b = await evaluate(
      input({
        requirements: [
          { ...(r[0] as Requirement), target: { value: 300, unit: "count" } },
        ],
      }),
    );
    expect(a.hash).not.toBe(b.hash);
  });

  it("orders results canonically by requirement and scope", () => {
    const results = evaluateResults(
      input({
        requirements: [
          req("z", {
            scope: "basket",
            field: "basket.item_count",
            op: "gte",
            target: { value: 1, unit: "count" },
          }),
          req("a", {
            scope: "item",
            role: "lamp",
            field: "lamp.lumens",
            op: "gte",
            target: { value: 1, unit: "count" },
          }),
        ],
      }),
    );
    const keys = results.map(resultKey);
    expect(keys).toEqual([...keys].sort());
  });

  it("rejects malformed input instead of guessing", () => {
    expect(() => evaluateResults(input({ now: "yesterday" }))).toThrow(
      EngineInputError,
    );
    expect(() =>
      evaluateResults(
        input({
          basket: {
            id: "b",
            lines: [{ role: "lamp", offerId: "nope", qty: 1 }],
          },
        }),
      ),
    ).toThrow(EngineInputError);
  });
});

describe("definePack", () => {
  it("rejects a pack with broken references, listing every problem", () => {
    let error: unknown;
    try {
      definePack({
        id: "Bad Pack",
        version: "one",
        title: "Bad",
        fields: {
          "offer.price": { kind: "money", label: "Price" },
          "x.size": {
            kind: "length",
            label: "Size",
            tolerance: { value: 1, unit: "W" },
          },
          "x.kind": {
            kind: "enum",
            label: "Kind",
            values: ["a"],
            aliases: { B: "c" },
          },
          "x.fresh": {
            kind: "text",
            label: "Fresh",
            freshness: "soon" as "1d",
          },
        },
        jsonLd: { "x.missing": ["name"], "x.size": ["bad path!"] },
        roles: [
          { role: "a", label: "A", required: true },
          { role: "a", label: "A again", required: false },
        ],
        pairs: [
          {
            id: "p",
            roles: ["a", "ghost"],
            field: "x.nope",
            label: "P",
            evaluate: () => null,
          },
        ],
        derive: [
          {
            id: "d1",
            scope: "item",
            output: "x.size",
            inputs: ["x.kind"],
            compute: () => null,
          },
          {
            id: "d2",
            scope: "item",
            output: "x.kind",
            inputs: ["x.size"],
            compute: () => null,
          },
        ],
      });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(PackError);
    const issues = (error as PackError).issues;
    expect(issues).toEqual(
      expect.arrayContaining([
        'id "Bad Pack" must be kebab-case',
        'version "one" is not semver',
        'field "offer.price" is defined by the engine',
        'field "x.size" tolerance unit W doesn\'t match kind length',
        'field "x.kind" alias "B" must be lowercase',
        'field "x.kind" alias "B" maps to unknown value "c"',
        'field "x.fresh" freshness "soon" is not like 60s/10m/24h/30d',
        'jsonLd maps unknown field "x.missing"',
        'jsonLd path "bad path!" for "x.size" is malformed',
        'role "a" is defined twice',
        'pair "p" uses undeclared role "ghost"',
        'pair "p" field "x.nope" is not defined',
        "derive rules form a cycle: x.size → x.kind → x.size",
      ]),
    );
  });

  it("freezes a valid pack and checks requirements against it", () => {
    expect(Object.isFrozen(kit)).toBe(true);
    expect(
      checkRequirements(
        [
          req("ok", {
            scope: "item",
            role: "lamp",
            field: "lamp.lumens",
            op: "exists",
            target: true,
          }),
          req("typo", {
            scope: "item",
            role: "lamp",
            field: "lamp.lumen",
            op: "exists",
            target: true,
          }),
          req("pairless", {
            scope: "pair",
            role: "lamp",
            pairRole: "bulb",
            field: "lamp.lumens",
            op: "exists",
            target: true,
          }),
        ],
        [kit],
      ),
    ).toEqual([
      'typo: field "lamp.lumen" is not defined by any pack',
      'pairless: no pair rule provides "lamp.lumens"',
    ]);
  });
});
