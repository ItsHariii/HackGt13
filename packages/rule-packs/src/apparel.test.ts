import type { ProofResult, Requirement } from "@cartel/contracts";
import {
  evaluateResults,
  fieldDef,
  packDefaults,
  signGate,
} from "@cartel/proof-engine";
import { describe, expect, it } from "vitest";
import { apparel } from "./apparel";
import {
  ASTER_HEEL_FACTS,
  greathubCheckout,
  greathubOffer,
  MARLOW_WRAP_FACTS,
  specFact,
  WEDDING_NOW,
  WEDDING_PACKS,
  WEDDING_REQUIREMENTS,
  weddingApproved,
  weddingCheckout,
} from "./fixtures";

const one = (results: readonly ProofResult[], id: string) => {
  const found = results.filter((r) => r.requirementId === id);
  expect(found, id).toHaveLength(1);
  return found[0] as ProofResult;
};

const run = (
  checkout = weddingCheckout(),
  requirements: Requirement[] = WEDDING_REQUIREMENTS,
) =>
  evaluateResults({
    ...checkout,
    requirements,
    packs: WEDDING_PACKS,
    now: WEDDING_NOW,
  });

describe("apparel: wedding guest (SDD §16.1)", () => {
  it("proves the Marlow wrap dress + Aster heels basket", async () => {
    const { report, contract } = await weddingApproved();
    const r = report.results;
    expect(one(r, "r_budget")).toMatchObject({
      verdict: "pass",
      observed: { amountMinor: 24_200, currency: "USD" },
    });
    expect(one(r, "r_arrival")).toMatchObject({
      verdict: "pass",
      evidenceState: "estimated",
    });
    expect(one(r, "r_returnable")).toMatchObject({
      verdict: "pass",
      evidenceState: "verified",
      observed: false,
    });
    expect(one(r, "r_navy")).toMatchObject({
      verdict: "pass",
      evidenceState: "source_stated",
    });
    expect(one(r, "r_looks")).toMatchObject({
      verdict: "unknown",
      reason: "subjective",
    });
    expect(one(r, "r_no_wool")).toMatchObject({
      verdict: "pass",
      importance: "preference",
    });
    expect(signGate(report, contract.waivers).ok).toBe(true);
  });

  it("fit from a garment measurement is an estimate: 36.5 in vs 36 ± 0.5", () => {
    expect(one(run(), "r_fit")).toMatchObject({
      verdict: "pass",
      evidenceState: "estimated",
      observed: { value: 36.5, unit: "in" },
      factIds: ["f_marlow_chest"],
    });
    const tight = weddingCheckout();
    const r = run({
      ...tight,
      facts: tight.facts.map((f) =>
        f.id === "f_marlow_chest"
          ? { ...f, value: { value: 37.25, unit: "in" } }
          : f,
      ),
    });
    expect(one(r, "r_fit")).toMatchObject({
      verdict: "fail",
      evidenceState: "estimated",
    });
  });

  it("fit from a body size chart adds the assumed ease, and stays an estimate", () => {
    const base = weddingCheckout();
    const facts = [
      ...base.facts.filter((f) => f.field !== "garment.chest"),
      specFact(
        "f_marlow_body",
        "dm_marlow_wrap_navy",
        "garment.body_chest",
        { value: 34.5, unit: "in" },
        { state: "verified" },
      ),
    ];
    expect(one(run({ ...base, facts }), "r_fit")).toMatchObject({
      verdict: "pass",
      evidenceState: "estimated",
      observed: { value: 36.5, unit: "in" },
    });
  });

  it("the final-sale flip fails `returnable`", () => {
    const r = run(weddingCheckout({ finalSale: true }));
    expect(one(r, "r_returnable")).toMatchObject({
      verdict: "fail",
      reason: "not_satisfied",
      observed: true,
    });
    expect(
      signGate({ results: r }, [
        {
          requirementId: "r_looks",
          acceptedState: "unknown",
          reason: "subjective",
        },
      ]).ok,
    ).toBe(false);
  });

  it("the exchange buffer: delivery + return transit + reship ≤ event date", () => {
    expect(one(run(), "r_exchange")).toMatchObject({
      verdict: "pass",
      evidenceState: "estimated",
      observed: "2026-10-07",
    });
    const late = (deliveryBy: string) => {
      const dress = greathubOffer({
        id: "dm_off_marlow_late",
        productId: "dm_marlow_wrap_navy",
        sku: "MW-WRAP-NVY-M",
        title: "Marlow Navy Wrap Dress",
        priceMinor: 16_800,
        deliveryBy,
      });
      return greathubCheckout(
        [{ role: "dress", offer: dress, facts: MARLOW_WRAP_FACTS }],
        {
          now: WEDDING_NOW,
          shippingMinor: 0,
          taxRate: "0",
        },
      );
    };
    // arrives Wednesday as asked, but an exchange can't make it back by Friday
    const r = run(late("2026-10-06"));
    expect(one(r, "r_arrival").verdict).toBe("pass");
    expect(one(r, "r_exchange")).toMatchObject({
      verdict: "fail",
      observed: "2026-10-11",
    });
  });

  it("uses the merchant's stated return transit when it gives one", () => {
    const base = weddingCheckout();
    const facts = [
      ...base.facts,
      ...["dm_off_marlow_wrap_navy_m", "dm_off_aster_block_heel_8"].flatMap(
        (offer) => [
          {
            ...specFact(`f_${offer}_transit`, offer, "returns.transit_days", {
              value: 1,
              unit: "day" as const,
            }),
            subjectKind: "offer" as const,
          },
          {
            ...specFact(`f_${offer}_reship`, offer, "returns.reship_days", {
              value: 1,
              unit: "day" as const,
            }),
            subjectKind: "offer" as const,
          },
        ],
      ),
    ];
    expect(one(run({ ...base, facts }), "r_exchange")).toMatchObject({
      verdict: "pass",
      observed: "2026-10-04",
    });
  });

  it("fiber constraints: percentages by wildcard field, and exclusions", () => {
    const cotton: Requirement = {
      id: "r_cotton",
      scope: "item",
      role: "shoes",
      field: "garment.fiber.cotton",
      op: "gte",
      target: { value: 90, unit: "pct" },
      importance: "hard",
      evidence: { minStateToPass: "source_stated" },
      materiality: "on_verdict_change",
      provenance: {
        kind: "user_selected",
        via: "facet",
        label: "Cotton ≥ 90%",
      },
    };
    expect(fieldDef("garment.fiber.cotton", WEDDING_PACKS)?.kind).toBe("ratio");
    const base = weddingCheckout();
    const facts = [
      ...base.facts,
      specFact("f_heel_cotton", "dm_aster_block_heel", "garment.fiber.cotton", {
        value: 85,
        unit: "pct",
      }),
      specFact("f_heel_fibers", "dm_aster_block_heel", "garment.fibers", [
        "cotton",
        "wool",
      ]),
    ];
    const wool: Requirement = {
      ...cotton,
      id: "r_wool",
      field: "garment.fibers",
      op: "excludes",
      target: ["wool"],
    };
    const r = run({ ...base, facts }, [cotton, wool]);
    expect(one(r, "r_cotton")).toMatchObject({
      verdict: "fail",
      observed: { value: 85, unit: "pct" },
    });
    expect(one(r, "r_wool")).toMatchObject({ verdict: "fail" });
  });

  it("return fee ≤ X from pack defaults", () => {
    const [returnable, fee] = packDefaults(apparel, {
      role: "dress",
      maxReturnFee: { amountMinor: 500, currency: "USD" },
    });
    expect(returnable?.field).toBe("offer.final_sale");
    const dress = greathubOffer({
      id: "dm_off_fee",
      productId: "dm_marlow_wrap_navy",
      sku: "MW-WRAP-NVY-M",
      title: "Marlow Navy Wrap Dress",
      priceMinor: 16_800,
      terms: { finalSale: false, returnWindowDays: 30, returnFeeMinor: 795 },
    });
    const r = run(
      greathubCheckout([{ role: "dress", offer: dress, facts: [] }], {
        now: WEDDING_NOW,
      }),
      [fee as Requirement],
    );
    expect(one(r, "d_apparel_return_fee")).toMatchObject({
      verdict: "fail",
      observed: { amountMinor: 795, currency: "USD" },
    });
  });

  it("color is at most what the seller says, even from a 'verified' extractor", () => {
    const base = weddingCheckout();
    const facts = base.facts.map((f) =>
      f.id === "f_marlow_color" ? { ...f, state: "verified" as const } : f,
    );
    expect(one(run({ ...base, facts }), "r_navy").evidenceState).toBe(
      "source_stated",
    );
    expect(ASTER_HEEL_FACTS.some((f) => f.field === "garment.color")).toBe(
      true,
    );
  });
});
