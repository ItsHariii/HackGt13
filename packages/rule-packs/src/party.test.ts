import type { Fact, ProofResult } from "@cartel/contracts";
import { evaluateResults, packDefaults, readAs } from "@cartel/proof-engine";
import { describe, expect, it } from "vitest";
import { greathubCheckout, greathubOffer, specFact } from "./fixtures";
import { party } from "./party";

const NOW = "2026-09-27T16:00:00Z";
const REQUIREMENTS = packDefaults(party, {
  guests: { value: 12, unit: "count" },
  avoid: ["nuts"],
  glutenFree: true,
});

function item(
  role: string,
  key: string,
  facts: [string, Fact["value"]][],
): { role: string; offer: ReturnType<typeof greathubOffer>; facts: Fact[] } {
  const productId = `dm_${key}`;
  return {
    role,
    offer: greathubOffer({
      id: `dm_off_${key}`,
      productId,
      sku: key.toUpperCase(),
      title: key,
      priceMinor: 3_000,
      deliveryBy: "2026-10-09",
    }),
    facts: facts.map(([field, value], i) =>
      specFact(`f_${key}_${i}`, productId, field, value),
    ),
  };
}

function check(
  line: ReturnType<typeof item>,
  requirementId: string,
): ProofResult {
  const results = evaluateResults({
    ...greathubCheckout([line], { now: NOW }),
    requirements: REQUIREMENTS,
    packs: [party],
    now: NOW,
  }).filter((r) => r.requirementId === requirementId);
  expect(results).toHaveLength(1);
  return results[0] as ProofResult;
}

const safeCake = item("cake", "safe_cake", [
  ["cake.servings", { value: 16, unit: "count" }],
  ["cake.gluten_free", true],
  ["cake.allergens", ["milk", "eggs"]],
]);
const nutCake = item("cake", "nut_cake", [
  ["cake.servings", { value: 10, unit: "count" }],
  ["cake.gluten_free", false],
  ["cake.allergens", ["milk", "eggs", "wheat", "nuts"]],
]);

describe("party: a birthday for 12 with a nut allergy and a gluten-free guest", () => {
  it("builds the defaults from the guests and dietary needs", () => {
    expect(REQUIREMENTS.map((r) => r.id).sort()).toEqual([
      "d_party_cake_avoid_allergens",
      "d_party_cake_gluten_free",
      "d_party_cake_serves_guests",
      "d_party_snacks_avoid_allergens",
      "d_party_snacks_gluten_free",
    ]);
    expect(packDefaults(party, {})).toEqual([]);
  });

  it("a cake that serves 16, gluten-free, without nuts passes, but only as stated", () => {
    for (const id of [
      "d_party_cake_serves_guests",
      "d_party_cake_gluten_free",
      "d_party_cake_avoid_allergens",
    ])
      expect(check(safeCake, id)).toMatchObject({
        verdict: "pass",
        evidenceState: "source_stated",
      });
  });

  it("a nut cake for 10 fails on servings, gluten and allergens", () => {
    for (const id of [
      "d_party_cake_serves_guests",
      "d_party_cake_gluten_free",
      "d_party_cake_avoid_allergens",
    ])
      expect(check(nutCake, id).verdict).toBe("fail");
  });

  it("reads GreatHub spec text for its fields", () => {
    const f = party.fields;
    expect(readAs("Molded fiber", f["tableware.material"] as never)).toBe(
      "compostable",
    );
    expect(readAs("Dinosaur", f["decorations.theme"] as never)).toBe(
      "dinosaurs",
    );
    expect(readAs("16", f["cake.servings"] as never)).toEqual({
      value: 16,
      unit: "count",
    });
    expect(readAs("milk, eggs", f["cake.allergens"] as never)).toEqual([
      "milk",
      "eggs",
    ]);
  });
});
