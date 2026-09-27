import { definePack } from "@cartel/proof-engine";

/*
 * Grocery (SDD §8.3, S6 "Grocery with allergies"). Allergens and traces are
 * lists, as Open Food Facts publishes them ("milk", "nuts", "soybeans").
 * A "gluten-free" claim can never be better than `source_stated`: only the
 * physical label settles it, so a hard gluten-free rule can pass on a
 * seller's or database's word but never shows as verified.
 *
 * Substitutions: the checkout always sends `order.substitutions_allowed =
 * false` and any swapped item is a material change that needs a new
 * signature, which is stricter than S6's "allergens(substitute) ⊆
 * allergens(original)".
 */

/** The label caveat every grocery proof carries (SDD §8.3). */
export const PHYSICAL_LABEL_CAVEAT =
  "Allergen data comes from the seller or a product database. Check the physical label before eating.";

export const grocery = definePack({
  id: "grocery",
  version: "1.0.0",
  title: "Grocery",
  fields: {
    "food.allergens": {
      kind: "list",
      label: "Allergens",
      authority: ["manufacturer", "merchant", "catalog"],
      freshness: "7d",
      maxState: "source_stated",
    },
    "food.traces": {
      kind: "list",
      label: "May contain",
      authority: ["manufacturer", "merchant", "catalog"],
      freshness: "7d",
      maxState: "source_stated",
    },
    "food.ingredients": {
      kind: "text",
      label: "Ingredients",
      authority: ["manufacturer", "merchant", "catalog"],
      freshness: "7d",
      maxState: "source_stated",
    },
    "food.gluten_free": {
      kind: "boolean",
      label: "Gluten-free",
      authority: ["manufacturer", "merchant", "catalog"],
      freshness: "7d",
      maxState: "source_stated",
    },
  },
  jsonLd: {
    "food.allergens": ["additionalProperty[name=Allergens].value"],
    "food.ingredients": [
      "additionalProperty[name=Ingredients].value",
      "nutrition.ingredients",
    ],
    "food.gluten_free": ["additionalProperty[name=Gluten-free].value"],
  },
  roles: [{ role: "food", label: "Grocery item", required: false }],
  defaults: [
    {
      ruleId: "avoid_allergens",
      build: (p) =>
        !Array.isArray(p.avoid) || p.avoid.length === 0
          ? null
          : {
              scope: "item",
              role: "food",
              field: "food.allergens",
              op: "excludes",
              target: p.avoid,
              importance: "hard",
              minStateToPass: "source_stated",
              materiality: "on_verdict_change",
            },
    },
    {
      ruleId: "avoid_traces",
      build: (p) =>
        !Array.isArray(p.avoid) || p.avoid.length === 0
          ? null
          : {
              scope: "item",
              role: "food",
              field: "food.traces",
              op: "excludes",
              target: p.avoid,
              importance: "preference",
              weight: 0.8,
              minStateToPass: "source_stated",
              materiality: "on_verdict_change",
            },
    },
    {
      ruleId: "gluten_free",
      build: (p) =>
        p.glutenFree !== true
          ? null
          : {
              scope: "item",
              role: "food",
              field: "food.gluten_free",
              op: "eq",
              target: true,
              importance: "hard",
              minStateToPass: "source_stated",
              materiality: "on_verdict_change",
            },
    },
  ],
});
