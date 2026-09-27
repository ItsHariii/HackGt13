import { definePack } from "@cartel/proof-engine";

/*
 * Party (birthday parties and small events): a cake that serves the
 * guests, snacks that avoid the guests' allergens, enough place settings,
 * and decorations in a theme. Like grocery, allergen and gluten-free claims
 * never get better than `source_stated`: only the physical label settles
 * them, and every party proof carries the same caveat.
 *
 * Params: `guests` (count), `avoid` (allergen list), `glutenFree` (boolean).
 */

const FOOD = {
  authority: ["manufacturer", "merchant", "catalog"],
  freshness: "7d",
  maxState: "source_stated",
} as const;

export const party = definePack({
  id: "party",
  version: "1.0.0",
  title: "Party",
  fields: {
    "cake.servings": {
      kind: "count",
      label: "Cake servings",
      unit: "count",
      authority: ["manufacturer", "merchant"],
    },
    "cake.gluten_free": { kind: "boolean", label: "Cake gluten-free", ...FOOD },
    "cake.allergens": { kind: "list", label: "Cake allergens", ...FOOD },
    "cake.traces": { kind: "list", label: "Cake may contain", ...FOOD },
    "snacks.gluten_free": {
      kind: "boolean",
      label: "Snacks gluten-free",
      ...FOOD,
    },
    "snacks.allergens": { kind: "list", label: "Snack allergens", ...FOOD },
    "snacks.traces": { kind: "list", label: "Snacks may contain", ...FOOD },
    "tableware.place_settings": {
      kind: "count",
      label: "Place settings",
      unit: "count",
      authority: ["manufacturer", "merchant"],
    },
    "tableware.material": {
      kind: "enum",
      label: "Tableware material",
      values: ["paper", "plastic", "compostable", "bamboo"],
      aliases: {
        "compostable fiber": "compostable",
        "molded fiber": "compostable",
        bagasse: "compostable",
        "coated paper": "paper",
      },
      authority: ["manufacturer", "merchant"],
    },
    "decorations.theme": {
      kind: "enum",
      label: "Decoration theme",
      values: [
        "dinosaurs",
        "space",
        "unicorns",
        "ocean",
        "jungle",
        "superheroes",
        "princess",
        "sports",
        "rainbow",
        "classic",
      ],
      aliases: {
        dinosaur: "dinosaurs",
        dino: "dinosaurs",
        unicorn: "unicorns",
        "under the sea": "ocean",
        safari: "jungle",
        superhero: "superheroes",
        "balloons and streamers": "classic",
      },
      authority: ["manufacturer", "merchant"],
    },
  },
  jsonLd: {
    "cake.servings": ["additionalProperty[name=Serves].value"],
    "cake.gluten_free": ["additionalProperty[name=Gluten-free].value"],
    "cake.allergens": ["additionalProperty[name=Allergens].value"],
    "cake.traces": ["additionalProperty[name=May contain].value"],
    "snacks.gluten_free": ["additionalProperty[name=Gluten-free].value"],
    "snacks.allergens": ["additionalProperty[name=Allergens].value"],
    "snacks.traces": ["additionalProperty[name=May contain].value"],
    "tableware.place_settings": [
      "additionalProperty[name=Place settings].value",
    ],
    "tableware.material": ["additionalProperty[name=Material].value"],
    "decorations.theme": ["additionalProperty[name=Theme].value"],
  },
  roles: [
    { role: "cake", label: "Cake", required: true },
    { role: "snacks", label: "Snacks", required: false },
    { role: "tableware", label: "Plates and cups", required: false },
    { role: "decorations", label: "Decorations", required: false },
  ],
  defaults: [
    {
      ruleId: "cake_serves_guests",
      build: (p) =>
        typeof p.guests !== "object" ||
        p.guests === null ||
        !("value" in p.guests)
          ? null
          : {
              scope: "item",
              role: "cake",
              field: "cake.servings",
              op: "gte",
              target: p.guests,
              importance: "hard",
              minStateToPass: "source_stated",
              materiality: "on_verdict_change",
            },
    },
    ...(["cake", "snacks"] as const).flatMap((role) => [
      {
        ruleId: `${role}_avoid_allergens`,
        build: (p: Readonly<Record<string, unknown>>) =>
          !Array.isArray(p.avoid) || p.avoid.length === 0
            ? null
            : ({
                scope: "item",
                role,
                field: `${role}.allergens`,
                op: "excludes",
                target: p.avoid as string[],
                importance: "hard",
                minStateToPass: "source_stated",
                materiality: "on_verdict_change",
              } as const),
      },
      {
        ruleId: `${role}_gluten_free`,
        build: (p: Readonly<Record<string, unknown>>) =>
          p.glutenFree !== true
            ? null
            : ({
                scope: "item",
                role,
                field: `${role}.gluten_free`,
                op: "eq",
                target: true,
                importance: "hard",
                minStateToPass: "source_stated",
                materiality: "on_verdict_change",
              } as const),
      },
    ]),
  ],
});
