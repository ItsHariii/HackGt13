// Generates GreatHub's party and grocery shelves into supabase/seed.sql (between the
// GENERATED markers). Deterministic: the same script always writes the same rows, so the
// seed diff only changes when this file does. Fictional brands only (SDD §16).
//
//   node scripts/catalog-gen.mjs          rewrite the generated block
//   node scripts/catalog-gen.mjs --check  exit 1 if seed.sql is out of date
//
// Spec names match the pack JSON-LD mappings: party.ts (Serves, Gluten-free, Allergens,
// May contain, Place settings, Material, Theme), grocery.ts (Allergens, May contain,
// Ingredients, Gluten-free) and the core Pack size. Some rows are deliberate edge cases
// for the proof engine; they are marked `edge:` below.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SEED = fileURLToPath(new URL("../supabase/seed.sql", import.meta.url));
const BEGIN = "-- BEGIN GENERATED (scripts/catalog-gen.mjs) --";
const END = "-- END GENERATED --";
const FIRST_N = 1001;

/** mulberry32: small, seeded, reproducible. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(20261010);
const pick = (xs) => xs[Math.floor(rand() * xs.length)];
const between = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
/** A price ending in .99, near `dollars`. */
const price = (dollars) =>
  Math.max(1, Math.round(dollars * (0.9 + rand() * 0.2))) * 100 - 1;

const slugify = (s) =>
  s
    .toLowerCase()
    .replace(/["'’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const rows = [];
function add(r) {
  const spec = Object.entries(r.spec)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${k}: ${v}`)
    .join(" | ");
  rows.push({
    slug: slugify(`${r.brand} ${r.name}`),
    stock: between(8, 60),
    deliveryMin: 1,
    deliveryMax: 3,
    policy: "ret_30_free",
    optionLabel: null,
    ...r,
    spec,
  });
}

// Party: cakes -----------------------------------------------------------------------------
const THEMES = [
  ["Dinosaur", "dinosaurs"],
  ["Space", "space"],
  ["Unicorn", "unicorns"],
  ["Under the Sea", "ocean"],
  ["Jungle Safari", "jungle"],
  ["Superhero", "superheroes"],
  ["Rainbow", "rainbow"],
  ["Classic", "classic"],
];
const CAKE_SIZES = [
  { label: '6" round', serves: 8, dollars: 32 },
  { label: '8" round', serves: 14, dollars: 44 },
  { label: "Quarter sheet", serves: 20, dollars: 58 },
  { label: "Half sheet", serves: 36, dollars: 84 },
];
for (const [theme] of THEMES) {
  const size = pick(CAKE_SIZES.slice(0, 3));
  const glutenFree = rand() < 0.35;
  add({
    brand: "Hearthbake",
    name: `${theme} Birthday Cake, ${size.label}`,
    department: "party",
    category: "cakes",
    roles: ["cake"],
    description: `A ${theme.toLowerCase()} decorated vanilla cake with buttercream. Baked to order.`,
    price: price(size.dollars),
    deliveryMin: 1,
    deliveryMax: 2,
    policy: "final_sale",
    spec: {
      Serves: size.serves,
      "Gluten-free": glutenFree ? "Yes" : "No",
      Allergens: glutenFree ? "milk, eggs" : "milk, eggs, wheat",
      "May contain": "soybeans",
      Theme: theme,
      Size: size.label,
    },
  });
}
// Allergy-friendly line: gluten-free, nut-free, dairy-free options.
for (const size of CAKE_SIZES) {
  add({
    brand: "Hearthbake",
    name: `Free-From Celebration Cake, ${size.label}`,
    department: "party",
    category: "cakes",
    roles: ["cake"],
    description:
      "Chocolate cake made without gluten, nuts, milk or eggs, in a dedicated allergen-free kitchen.",
    price: price(size.dollars + 12),
    deliveryMin: 2,
    deliveryMax: 3,
    policy: "final_sale",
    spec: {
      Serves: size.serves,
      "Gluten-free": "Yes",
      Allergens: "soybeans",
      Theme: "Classic",
      Size: size.label,
    },
  });
}
// edge: gluten-free by recipe, but the listing never says so (the rule can't pass).
add({
  brand: "Hearthbake",
  name: "Flourless Chocolate Torte",
  department: "party",
  category: "cakes",
  roles: ["cake"],
  description: "A dense flourless chocolate torte with a cocoa dusting.",
  price: price(38),
  policy: "final_sale",
  spec: { Serves: 10, Allergens: "milk, eggs", Theme: "Classic" },
});
// edge: no nuts in the recipe, but made on shared lines ("May contain: nuts").
add({
  brand: "Hearthbake",
  name: "Confetti Sprinkle Cake, Quarter sheet",
  department: "party",
  category: "cakes",
  roles: ["cake"],
  description: "Funfetti sheet cake with rainbow sprinkles.",
  price: price(52),
  policy: "final_sale",
  spec: {
    Serves: 20,
    "Gluten-free": "No",
    Allergens: "milk, eggs, wheat",
    "May contain": "nuts, peanuts",
    Theme: "Rainbow",
  },
});
// edge: serves 10, one short of most kids' parties; and a 6-day bake that misses a weekend.
add({
  brand: "Hearthbake",
  name: 'Dinosaur Dig Cake, 7" round',
  department: "party",
  category: "cakes",
  roles: ["cake"],
  description: "Chocolate 'dirt' cake with candy fossils.",
  price: price(36),
  policy: "final_sale",
  spec: {
    Serves: 10,
    "Gluten-free": "No",
    Allergens: "milk, eggs, wheat",
    Theme: "Dinosaur",
  },
});
add({
  brand: "Hearthbake",
  name: "Tiered Unicorn Showpiece Cake",
  department: "party",
  category: "cakes",
  roles: ["cake"],
  description: "Two tiers, hand-piped mane, gold horn. Made to order.",
  price: price(149),
  deliveryMin: 5,
  deliveryMax: 6,
  policy: "final_sale",
  spec: {
    Serves: 40,
    "Gluten-free": "No",
    Allergens: "milk, eggs, wheat",
    Theme: "Unicorn",
  },
});
// Cupcakes.
for (const [count, dollars] of [
  [12, 24],
  [24, 42],
]) {
  for (const gf of [false, true]) {
    add({
      brand: "Hearthbake",
      name: `${gf ? "Gluten-Free " : ""}Vanilla Cupcakes, ${count} pack`,
      department: "party",
      category: "cakes",
      roles: ["cake"],
      description: `${count} vanilla cupcakes with swirled buttercream${gf ? ", baked without gluten" : ""}.`,
      price: price(dollars + (gf ? 6 : 0)),
      deliveryMin: 1,
      deliveryMax: 2,
      policy: "final_sale",
      stock: gf && count === 24 ? 0 : between(6, 30), // edge: out of stock
      spec: {
        Serves: count,
        "Pack size": count,
        "Gluten-free": gf ? "Yes" : "No",
        Allergens: gf ? "milk, eggs" : "milk, eggs, wheat",
      },
    });
  }
}

// Party: snacks (also sold as groceries) ----------------------------------------------------
const SNACKS = [
  ["Sea Salt Popcorn", 12, "No", "", "", 14],
  ["Cheddar Cheese Crackers", 12, "No", "milk, wheat", "soybeans", 11],
  ["Rice Crisps, Lightly Salted", 10, "Yes", "", "", 12],
  ["Fruit Snacks, Mixed Berry", 20, "Yes", "", "", 13],
  ["Pretzel Twists", 16, "No", "wheat", "", 9],
  ["Tortilla Chips and Salsa Cups", 12, "Yes", "", "", 16],
  ["Veggie Straws", 12, "Yes", "", "milk", 12],
  [
    "Chocolate Chip Cookies",
    24,
    "No",
    "milk, eggs, wheat, soybeans",
    "nuts",
    10,
  ],
  [
    "Peanut Butter Sandwich Cookies",
    24,
    "No",
    "peanuts, wheat, soybeans",
    "nuts, milk",
    10,
  ],
  ["Trail Mix Snack Packs", 10, "Yes", "nuts, peanuts", "sesame", 15],
  ["Gluten-Free Graham Bites", 12, "Yes", "", "milk", 12],
  ["Apple Chips", 10, "Yes", "", "", 11],
  ["Mini Rice Cakes, Chocolate Drizzle", 12, "Yes", "milk, soybeans", "", 12],
  ["Sunflower Seed Butter Cups", 12, "Yes", "", "", 14],
  ["Cheese Puffs", 18, "Yes", "milk", "", 10],
];
for (const [name, pack, gf, allergens, traces, dollars] of SNACKS) {
  add({
    brand: "Pipit",
    name: `${name}, ${pack} pack`,
    department: "party",
    category: "snacks",
    roles: ["snacks", "food"],
    description: `${pack} single-serve bags. Good for party tables and lunchboxes.`,
    price: price(dollars),
    policy: "final_sale",
    spec: {
      "Pack size": pack,
      "Gluten-free": gf,
      Allergens: allergens || "none",
      "May contain": traces,
    },
  });
}
// Drinks.
for (const [name, pack, dollars] of [
  ["Sparkling Apple Juice Boxes", 12, 9],
  ["Lemonade Pouches", 10, 8],
  ["Fruit Punch Juice Boxes", 24, 14],
  ["Still Water Bottles, 8 oz", 24, 7],
  ["Chocolate Milk Boxes", 12, 12],
]) {
  add({
    brand: "Fernway",
    name: `${name}, ${pack} pack`,
    department: "party",
    category: "drinks",
    roles: ["snacks", "food"],
    description: `${pack} kid-size drinks, shelf-stable.`,
    price: price(dollars),
    policy: "final_sale",
    spec: {
      "Pack size": pack,
      "Gluten-free": "Yes",
      Allergens: name.includes("Milk") ? "milk" : "none",
    },
  });
}

// Party: tableware -------------------------------------------------------------------------
const TABLEWARE = [
  ["Molded Fiber Plates and Cups Set", "Molded fiber", 16, 22],
  ["Compostable Party Set", "Compostable", 24, 34],
  ["Bamboo Plate Set", "Bamboo", 12, 28],
  ["Plastic Plates and Cups Set", "Plastic", 20, 15],
  ["Paper Plates, Cups and Napkins", "Paper", 16, 12],
  ["Paper Party Pack, Large", "Paper", 32, 21],
];
for (const [name, material, settings, dollars] of TABLEWARE) {
  add({
    brand: "Brightfold",
    name: `${name}, serves ${settings}`,
    department: "party",
    category: "tableware",
    roles: ["tableware"],
    description: `Plates, cups and napkins for ${settings} guests.`,
    price: price(dollars),
    spec: {
      "Place settings": settings,
      Material: material,
      Pieces: "plates, cups, napkins",
    },
  });
}
for (const [theme] of THEMES.slice(0, 6)) {
  add({
    brand: "Brightfold",
    name: `${theme} Themed Tableware, serves 12`,
    department: "party",
    category: "tableware",
    roles: ["tableware"],
    description: `Printed ${theme.toLowerCase()} plates, cups and napkins for 12.`,
    price: price(19),
    policy: "ret_30_fee",
    spec: {
      "Place settings": 12,
      Material: "Paper",
      Theme: theme,
      Pieces: "plates, cups, napkins",
    },
  });
}
// edge: "serves 8" — too few for 12 guests.
add({
  brand: "Brightfold",
  name: "Mini Tea Party Set, serves 8",
  department: "party",
  category: "tableware",
  roles: ["tableware"],
  description: "Scalloped paper plates and cups for 8.",
  price: price(11),
  spec: { "Place settings": 8, Material: "Paper" },
});

// Party: decorations -----------------------------------------------------------------------
for (const [theme] of THEMES) {
  add({
    brand: "Galloon",
    name: `${theme} Party Decoration Kit`,
    department: "party",
    category: "decorations",
    roles: ["decorations"],
    description: `Banner, 24 latex balloons, table cover and cake topper in a ${theme.toLowerCase()} theme.`,
    price: price(26),
    policy: "ret_14_free",
    spec: {
      Theme: theme,
      "Pack size": 27,
      Contents: "banner, 24 balloons, table cover, cake topper",
      "Latex-free": "No",
    },
  });
}
for (const [name, pack, dollars, latexFree] of [
  ["Foil Number Balloon", 1, 7, "Yes"],
  ["Latex Balloons, Assorted", 50, 12, "No"],
  ["Latex-Free Foil Balloon Bouquet", 12, 24, "Yes"],
  ["Paper Streamers, 6 rolls", 6, 8, "Yes"],
  ["Happy Birthday Banner", 1, 9, "Yes"],
]) {
  add({
    brand: "Galloon",
    name,
    department: "party",
    category: "decorations",
    roles: ["decorations"],
    description: `${name} in bright colors.`,
    price: price(dollars),
    policy: "ret_14_free",
    // edge: the balloon bouquet ships slowly.
    ...(name.startsWith("Latex-Free")
      ? { deliveryMin: 6, deliveryMax: 9 }
      : {}),
    spec: {
      Theme: "Classic",
      "Pack size": pack,
      "Latex-free": latexFree,
    },
  });
}

// Grocery ----------------------------------------------------------------------------------
const GROCERY = [
  [
    "Whole Wheat Sandwich Bread",
    "bakery",
    "No",
    "wheat, soybeans",
    "sesame",
    5,
    "whole wheat flour, water, yeast, soybean oil, salt",
  ],
  [
    "Gluten-Free Sandwich Bread",
    "bakery",
    "Yes",
    "eggs",
    "",
    7,
    "rice flour, tapioca starch, eggs, sunflower oil",
  ],
  [
    "Plain Bagels, 6 pack",
    "bakery",
    "No",
    "wheat",
    "sesame",
    6,
    "wheat flour, water, malt, yeast, salt",
  ],
  [
    "Corn Tortillas, 30 count",
    "bakery",
    "Yes",
    "",
    "",
    4,
    "corn masa, water, lime",
  ],
  ["Rolled Oats", "pantry", "No", "", "wheat", 5, "whole grain oats"],
  [
    "Certified Gluten-Free Oats",
    "pantry",
    "Yes",
    "",
    "",
    7,
    "whole grain oats",
  ],
  ["Penne Pasta", "pantry", "No", "wheat", "eggs", 3, "durum wheat semolina"],
  ["Brown Rice Penne", "pantry", "Yes", "", "", 4, "brown rice flour"],
  [
    "Creamy Peanut Butter",
    "pantry",
    "Yes",
    "peanuts",
    "nuts",
    5,
    "peanuts, salt",
  ],
  [
    "Sunflower Seed Butter",
    "pantry",
    "Yes",
    "",
    "",
    7,
    "roasted sunflower seeds, salt",
  ],
  ["Almond Butter", "pantry", "Yes", "nuts", "peanuts", 9, "almonds"],
  ["Strawberry Jam", "pantry", "Yes", "", "", 4, "strawberries, sugar, pectin"],
  [
    "Honey Nut Cereal",
    "pantry",
    "No",
    "nuts, wheat",
    "milk",
    5,
    "whole grain oats, sugar, honey, almond flavor",
  ],
  ["Corn Flakes", "pantry", "Yes", "", "", 4, "milled corn, sugar, salt"],
  [
    "Granola Bars, 12 pack",
    "snacks",
    "No",
    "nuts, wheat, soybeans",
    "peanuts, milk",
    6,
    "oats, almonds, honey, soy lecithin",
  ],
  [
    "Nut-Free Granola Bites",
    "snacks",
    "Yes",
    "",
    "",
    7,
    "oats, sunflower seeds, maple syrup",
  ],
  [
    "Whole Milk, 1 gallon",
    "drinks",
    "Yes",
    "milk",
    "",
    5,
    "whole milk, vitamin D",
  ],
  [
    "Oat Milk, Unsweetened",
    "drinks",
    "No",
    "",
    "wheat",
    4,
    "water, oats, sunflower oil, salt",
  ],
  [
    "Soy Milk",
    "drinks",
    "Yes",
    "soybeans",
    "",
    4,
    "water, soybeans, cane sugar",
  ],
  ["Orange Juice, 52 oz", "drinks", "Yes", "", "", 5, "orange juice"],
  [
    "Greek Yogurt Cups, 4 pack",
    "drinks",
    "Yes",
    "milk",
    "",
    6,
    "cultured milk",
  ],
  [
    "Hummus Snack Cups, 6 pack",
    "snacks",
    "Yes",
    "sesame",
    "",
    6,
    "chickpeas, tahini, olive oil, lemon",
  ],
  [
    "Cheddar Cheese Slices",
    "snacks",
    "Yes",
    "milk",
    "",
    5,
    "pasteurized milk, cultures, salt, enzymes",
  ],
  ["Baby Carrots, 2 lb", "snacks", "Yes", "", "", 3, "carrots"],
  [
    "Mini Pizza Kit",
    "bakery",
    "No",
    "milk, wheat",
    "soybeans",
    9,
    "wheat flour, mozzarella, tomato sauce",
  ],
];
for (const [
  name,
  category,
  gf,
  allergens,
  traces,
  dollars,
  ingredients,
] of GROCERY) {
  add({
    brand: pick(["Grainhouse", "Fernway"]),
    name,
    department: "grocery",
    category,
    roles: ["food"],
    description: `${name}. Check the physical label before eating.`,
    price: price(dollars),
    policy: "final_sale",
    // edge: two grocery items are temporarily low or out of stock.
    ...(name === "Certified Gluten-Free Oats" ? { stock: 0 } : {}),
    ...(name === "Sunflower Seed Butter" ? { stock: 3 } : {}),
    spec: {
      "Gluten-free": gf,
      Allergens: allergens || "none",
      "May contain": traces,
      Ingredients: ingredients,
    },
  });
}

// SQL ---------------------------------------------------------------------------------------
const q = (s) => (s === null ? "null" : `'${String(s).replace(/'/g, "''")}'`);
const seen = new Set();
const values = rows.map((r, i) => {
  const n = FIRST_N + i;
  if (seen.has(r.slug)) throw new Error(`duplicate slug ${r.slug}`);
  seen.add(r.slug);
  const sku = `${r.brand.slice(0, 2).toUpperCase()}-${n}`;
  return `(${n}, ${q(r.slug)}, ${q(r.brand)}, ${q(r.name)}, ${q(r.department)}, ${q(r.category)}, '{${r.roles.join(",")}}',
 ${q(r.description)}, ${q(sku)}, ${q(`${sku}-US`)}, ${q(r.optionLabel)},
 ${r.price}, ${r.deliveryMin}, ${r.deliveryMax}, ${q(r.policy)}, ${r.stock},
 ${q(r.spec)})`;
});
const block = [
  BEGIN,
  `-- ${rows.length} rows: party (cakes, snacks, drinks, tableware, decorations) and grocery.`,
  "insert into seed_catalog values",
  `${values.join(",\n")};`,
  END,
].join("\n");

const seed = readFileSync(SEED, "utf8");
const start = seed.indexOf(BEGIN);
const end = seed.indexOf(END);
if (start < 0 || end < start)
  throw new Error("GENERATED markers missing in seed.sql");
const next = seed.slice(0, start) + block + seed.slice(end + END.length);
if (process.argv.includes("--check")) {
  if (next !== seed) {
    console.error("seed.sql is out of date: run node scripts/catalog-gen.mjs");
    process.exit(1);
  }
  console.log(`seed.sql is up to date (${rows.length} generated rows)`);
} else {
  writeFileSync(SEED, next);
  console.log(`wrote ${rows.length} generated rows to supabase/seed.sql`);
}
