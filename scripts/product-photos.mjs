// Fetches one Unsplash stock photo per GreatHub product into apps/greathub/public/products and
// writes the seed block that points greathub.products.image_path and the Cartel catalog's
// public.products.image_url at them. GreatHub hosts its own photos, as a real store's CDN would.
//
//   UNSPLASH_ACCESS_KEY=… node scripts/product-photos.mjs          fetch missing photos, rewrite the seed block
//                                     (several keys: UNSPLASH_ACCESS_KEY_1, _2, … are used in turn)
//   UNSPLASH_ACCESS_KEY=… node scripts/product-photos.mjs --wait   same, sleeping through hourly rate limits
//   node scripts/product-photos.mjs --seed                         rewrite the seed block for the photos on disk
//   node scripts/product-photos.mjs --check                        exit 1 if photos, credits or seed drift
//
// Resumable: products already in credits.json are skipped, and credits are saved after every
// photo. Each photo used is reported to Unsplash's download endpoint, as the API guidelines ask.
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { fileURLToPath } from "node:url";

const SEED = fileURLToPath(new URL("../supabase/seed.sql", import.meta.url));
const DIR = fileURLToPath(
  new URL("../apps/greathub/public/products/", import.meta.url),
);
const CREDITS = `${DIR}credits.json`;
const BEGIN = "-- BEGIN GENERATED (scripts/product-photos.mjs) --";
const END = "-- END GENERATED (scripts/product-photos.mjs) --";
const ANCHOR = "-- Kits (SDD §11.5, §16.1) ";
const API = "https://api.unsplash.com";
const UTM = "utm_source=greathub&utm_medium=referral";

/** Where the product name is a model number, the category says what to photograph. */
const CATEGORY_QUERY = {
  "home_office/monitors": "computer monitor on desk",
  "home_office/desks": "minimal wooden desk",
  "home_office/chairs": "ergonomic office chair",
  "home_office/cables": "usb-c cable",
  "home_office/webcams": "webcam",
  "home_office/docks": "usb-c hub laptop",
  "home_office/audio": "usb microphone desk",
  "home_office/lighting": "led video light",
  "apparel/knitwear": "knit cardigan",
  "apparel/skirts": "pleated midi skirt",
  "travel/luggage": "carry-on suitcase",
  "travel/power": "power bank",
  "travel/toiletries": "travel toiletry bottles",
  "travel/organization": "packing cubes",
  "travel/comfort": "travel neck pillow",
  "party/tableware": "paper party plates",
};

/** Products whose category or name alone would search for the wrong thing. */
const SLUG_QUERY = {
  "loop-hdmi-2-1-cable": "hdmi cable",
  "birchline-single-monitor-arm": "monitor arm desk",
  "birchline-felt-desk-mat": "felt desk mat",
  "kestrel-adjustable-footrest": "footrest under desk",
  "marlow-navy-wrap-dress": "navy wrap dress",
  "marlow-heather-wrap-dress": "wrap dress",
  "marlow-navy-sheath-dress": "navy sheath dress",
  "marlow-linen-shift-dress": "linen dress",
  "marlow-navy-midi-dress": "satin midi dress",
  "marlow-navy-suit-jacket": "navy suit jacket",
  "marlow-navy-suit-trousers": "navy trousers",
  "marlow-oxford-shirt": "oxford shirt",
  "marlow-linen-shirt": "linen shirt",
  "marlow-silk-tie": "silk tie",
  "marlow-leather-belt": "leather belt",
  "aster-mini-clutch": "clutch bag",
  "marlow-cashmere-scarf": "cashmere scarf",
  "aster-block-heel": "block heel shoes",
  "aster-pointed-pump": "pointed pumps shoes",
  "aster-strappy-sandal": "strappy sandals",
  "aster-leather-loafer": "leather loafers",
  "aster-ballet-flat": "ballet flats shoes",
  "fieldnote-21-carry-on": "hard shell carry-on luggage",
  "fieldnote-25-checked-bag": "large suitcase",
  "birchline-mini-desk-44": "home office desk",
  "birchline-wide-desk-52": "home office desk",
  "kestrel-mesh-task-chair": "mesh office chair",
  "galloon-paper-streamers-6-rolls": "party streamers",
  "atlas-weekender-duffel": "weekender duffel bag",
  "volt-universal-travel-adapter": "travel plug adapter",
  "volt-eu-plug-adapter": "travel plug adapter",
  "volt-voltage-converter": "voltage converter",
  "hearthbake-free-from-celebration-cake-6-round": "celebration cake",
  "hearthbake-free-from-celebration-cake-8-round": "celebration cake",
  "hearthbake-free-from-celebration-cake-quarter-sheet": "celebration cake",
  "hearthbake-free-from-celebration-cake-half-sheet": "celebration cake",
  "hearthbake-classic-birthday-cake-quarter-sheet": "birthday cake",
  "hearthbake-dinosaur-dig-cake-7-round": "dinosaur cake",
  "hearthbake-tiered-unicorn-showpiece-cake": "unicorn cake",
  "brightfold-bamboo-plate-set-serves-12": "bamboo plates",
  "brightfold-mini-tea-party-set-serves-8": "tea party set",
  "galloon-classic-party-decoration-kit": "birthday party decorations",
  "fernway-sparkling-apple-juice-boxes-12-pack": "juice boxes",
  "fernway-fruit-punch-juice-boxes-24-pack": "juice boxes",
  "fernway-lemonade-pouches-10-pack": "lemonade",
  "fernway-still-water-bottles-8-oz-24-pack": "water bottles",
  "fernway-chocolate-milk-boxes-12-pack": "chocolate milk",
  "grainhouse-certified-gluten-free-oats": "rolled oats",
  "grainhouse-mini-pizza-kit": "mini pizza",
  "pipit-tortilla-chips-and-salsa-cups-12-pack": "tortilla chips salsa",
  "pipit-sunflower-seed-butter-cups-12-pack": "sunflower seed butter",
  "pipit-gluten-free-graham-bites-12-pack": "graham crackers",
};

/** When a product's own search runs dry, the category's broader one. */
const FALLBACK_QUERY = {
  "home_office/webcams": "webcam computer",
  "apparel/shoes": "women's shoes",
  "party/cakes": "birthday cake",
  "party/decorations": "birthday party decorations",
  "party/snacks": "party snacks",
  "grocery/pantry": "pantry food",
};

/** Photos looked at and turned down (wrong product, too dark); never picked again. */
const REJECTED = new Set([
  "7d8pxcMVl7A", // a mains power cord, not USB-C
  "CkzzjmZbEMA", // the chair is a speck in the room
  "lAq8F7142Ik", // almost black
  "UqsABJBl2fw", // a close-up of icing
  "gyxVWeC_OfE", // a keyboard, not a desk
  "JQ7yAefHV14", // no desk to speak of
  "4sgszK_uqmA", // a vintage leather case
  "hDtjXwMl1-c", // tissue paper, not streamers
  "DPcboE2nSjo", // an exploded parts diagram
  "wHidMzRSGeo", // fabric on grass, no dress
]);

/** "Sea Salt Popcorn, 12 pack" -> "sea salt popcorn"; "Gluten-Free Oats" -> "oats". */
function nameQuery(name) {
  return (
    name
      .split(",")[0]
      .replace(/\bdecoration kit\b/i, "decorations")
      // Diet labels narrow a stock search to nothing; the product looks the same.
      .replace(/\b(certified|gluten-free|nut-free|latex-free)\s+/gi, "")
      .replace(/\b\d+(\.\d+)?\s*(pack|count|oz|lb|gallon)\b/gi, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase()
  );
}

/** GreatHub products (one per slug) from the seed_catalog rows, hand-written and generated. */
function products() {
  const seed = readFileSync(SEED, "utf8");
  const row =
    /^\s*\((\d+), '([a-z0-9-]+)', '((?:[^']|'')*)', '((?:[^']|'')*)', '([a-z_]+)', '([a-z-]+)'/gm;
  const bySlug = new Map();
  for (const m of seed.matchAll(row)) {
    const [, , slug, , name, department, category] = m;
    if (!bySlug.has(slug))
      bySlug.set(slug, {
        slug,
        name: name.replaceAll("''", "'"),
        department,
        category,
      });
  }
  if (bySlug.size === 0) throw new Error("no seed_catalog rows found");
  return [...bySlug.values()].sort((a, b) => a.slug.localeCompare(b.slug));
}

function queryFor(p) {
  return (
    SLUG_QUERY[p.slug] ??
    CATEGORY_QUERY[`${p.department}/${p.category}`] ??
    nameQuery(p.name)
  );
}

function readCredits() {
  return existsSync(CREDITS) ? JSON.parse(readFileSync(CREDITS, "utf8")) : {};
}

function writeCredits(credits) {
  const sorted = Object.fromEntries(
    Object.entries(credits).sort(([a], [b]) => a.localeCompare(b)),
  );
  writeFileSync(CREDITS, `${JSON.stringify(sorted, null, 2)}\n`);
}

function sqlList(slugs) {
  const lines = [];
  for (let i = 0; i < slugs.length; i += 4)
    lines.push(
      `  ${slugs
        .slice(i, i + 4)
        .map((s) => `'${s}'`)
        .join(", ")}`,
    );
  return lines.join(",\n");
}

/** The seed block for the photos on disk, or null when there are none yet. */
function seedBlock(slugs) {
  if (slugs.length === 0) return null;
  return `${BEGIN}
-- ${slugs.length} Unsplash stock photos served by GreatHub (apps/greathub/public/products).
-- The catalog links to GreatHub's copy, with the same origin rule as product links above.
update greathub.products set image_path = '/products/' || slug || '.webp'
where slug in (
${sqlList(slugs)}
);
update public.products p
set image_url = coalesce(nullif(current_setting('app.greathub_origin', true), ''), 'http://localhost:3001')
  || gp.image_path
from seed_catalog s
join greathub.products gp on gp.slug = s.slug
where p.source = 'greathub' and p.external_id = s.sku and gp.image_path is not null;
${END}
`;
}

function withBlock(seed, block) {
  const start = seed.indexOf(BEGIN);
  const stripped =
    start === -1
      ? seed
      : seed.slice(0, start) +
        seed
          .slice(seed.indexOf(END, start) + END.length + 1)
          .replace(/^\n/, "");
  if (!block) return stripped;
  const at = stripped.indexOf(ANCHOR);
  if (at === -1) throw new Error(`seed.sql has no "${ANCHOR}" section`);
  return `${stripped.slice(0, at)}${block}\n${stripped.slice(at)}`;
}

function photoSlugs() {
  if (!existsSync(DIR)) return [];
  return readdirSync(DIR)
    .filter((f) => f.endsWith(".webp"))
    .map((f) => f.slice(0, -".webp".length))
    .sort();
}

// --check ----------------------------------------------------------------------------------------
function check() {
  const problems = [];
  const credits = readCredits();
  const files = new Set(photoSlugs());
  const slugs = products().map((p) => p.slug);
  const known = new Set(slugs);
  // A product without a photo yet shows its category icon; that's allowed, not drift.
  const missing = slugs.filter((s) => !files.has(s));
  for (const s of files)
    if (!credits[s]) problems.push(`${s}.webp: no credit in credits.json`);
  for (const s of files)
    if (!known.has(s)) problems.push(`${s}.webp: not a GreatHub product`);
  for (const s of Object.keys(credits))
    if (!files.has(s)) problems.push(`credits.json: ${s} has no photo`);
  const ids = Object.values(credits).map((c) => c.id);
  if (new Set(ids).size !== ids.length)
    problems.push("credits.json: a photo is used twice");
  const seed = readFileSync(SEED, "utf8");
  if (withBlock(seed, seedBlock([...files].sort())) !== seed)
    problems.push(
      "seed.sql photo block is stale: run node scripts/product-photos.mjs",
    );
  if (problems.length) {
    for (const p of problems) console.error(`✗ ${p}`);
    process.exit(1);
  }
  console.log(
    `✓ ${files.size} of ${slugs.length} GreatHub products have photos, each credited and seeded`,
  );
  if (missing.length)
    console.log(
      `  ${missing.length} still to fetch: node scripts/product-photos.mjs`,
    );
}

// fetch ------------------------------------------------------------------------------------------
/** Explore's kit items (supabase/seed.sql kit_items) first, then the shelves the demo leans on. */
const FIRST_SLUGS = [
  "birchline-compact-desk-46",
  "kestrel-mesh-task-chair",
  "vireo-u2727",
  "halden-m27q-usbc",
  "loop-usb-c-cable-100w",
  "pica-1080p-webcam",
  "marlow-navy-wrap-dress",
  "aster-block-heel",
  "fieldnote-21-carry-on",
  "volt-20k-power-bank",
  "fieldnote-travel-bottles-3-4-oz",
  "volt-universal-travel-adapter",
];
const FIRST_CATEGORIES = [
  "party/cakes",
  "apparel/dresses",
  "apparel/shoes",
  "party/decorations",
];

function rank(p) {
  const slug = FIRST_SLUGS.indexOf(p.slug);
  if (slug !== -1) return slug;
  const cat = FIRST_CATEGORIES.indexOf(`${p.department}/${p.category}`);
  return cat === -1 ? 1000 : 100 + cat;
}

class RateLimited extends Error {}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Unsplash access keys, used in turn: each allows 50 requests an hour. When all are spent,
 * either wait out the hour (--wait) or stop with progress saved.
 */
function unsplash(keys, wait) {
  const spent = new Set();
  let at = 0;
  return async function call(url) {
    for (;;) {
      if (spent.size === keys.length) {
        if (!wait) throw new RateLimited(url);
        console.log(
          `… every key is rate limited; waiting an hour (${new Date().toLocaleTimeString()})`,
        );
        await sleep(61 * 60 * 1000);
        spent.clear();
      }
      while (spent.has(at)) at = (at + 1) % keys.length;
      const res = await fetch(
        url.startsWith("https://") ? url : `${API}${url}`,
        {
          headers: {
            Authorization: `Client-ID ${keys[at]}`,
            "Accept-Version": "v1",
          },
        },
      );
      if (res.status === 403 || res.status === 429) {
        spent.add(at);
        continue;
      }
      if (!res.ok)
        throw new Error(`${url}: HTTP ${res.status} ${await res.text()}`);
      if (res.headers.get("x-ratelimit-remaining") === "0") spent.add(at);
      return res.json();
    }
  };
}

async function fetchPhotos(keys, wait) {
  mkdirSync(DIR, { recursive: true });
  const call = unsplash(keys, wait);
  const credits = readCredits();
  for (const [slug, c] of Object.entries(credits))
    if (REJECTED.has(c.id)) {
      delete credits[slug];
      rmSync(`${DIR}${slug}.webp`, { force: true });
      console.log(`↺ ${slug}: rejected photo removed`);
    }
  writeCredits(credits);
  const used = new Set([
    ...REJECTED,
    ...Object.values(credits).map((c) => c.id),
  ]);
  const pending = products()
    .filter((p) => !credits[p.slug] || !existsSync(`${DIR}${p.slug}.webp`))
    .sort((a, b) => rank(a) - rank(b));
  const groups = Map.groupBy(pending, queryFor);
  console.log(
    `${pending.length} products need photos, ${groups.size} searches, ${keys.length} key(s)`,
  );
  const cache = new Map();
  async function search(query, page) {
    const key = `${query}#${page}`;
    if (!cache.has(key))
      cache.set(
        key,
        (
          await call(
            `/search/photos?query=${encodeURIComponent(query)}&per_page=30&page=${page}&content_filter=high`,
          )
        ).results,
      );
    return cache.get(key);
  }
  /** The next unused photo for a query: its first two pages, then the category fallback. */
  async function next(query, p) {
    const fallback = FALLBACK_QUERY[`${p.department}/${p.category}`];
    const first = await search(query, 1);
    const pages = [first];
    // A short first page means there is no second one.
    if (first.length === 30) pages.push(() => search(query, 2));
    if (fallback && fallback !== query) pages.push(() => search(fallback, 1));
    for (const page of pages) {
      const results = typeof page === "function" ? await page() : page;
      const photo = results.find((r) => !used.has(r.id));
      if (photo) return photo;
    }
    return null;
  }
  for (const [query, items] of groups) {
    for (const p of items) {
      const photo = await next(query, p);
      if (!photo) {
        console.warn(`✗ ${p.slug}: no unused photo for "${query}"`);
        continue;
      }
      used.add(photo.id);
      await call(photo.links.download_location);
      const img = await fetch(
        `${photo.urls.raw}&w=800&h=800&fit=crop&crop=entropy&fm=webp&q=72`,
      );
      if (!img.ok) throw new Error(`${p.slug}: image HTTP ${img.status}`);
      writeFileSync(
        `${DIR}${p.slug}.webp`,
        Buffer.from(await img.arrayBuffer()),
      );
      credits[p.slug] = {
        id: photo.id,
        query,
        photographer: photo.user.name,
        profile: `${photo.user.links.html}?${UTM}`,
        page: `${photo.links.html}?${UTM}`,
      };
      writeCredits(credits);
      console.log(`✓ ${p.slug} ← ${photo.user.name} ("${query}")`);
    }
  }
}

function writeSeed() {
  const seed = readFileSync(SEED, "utf8");
  const next = withBlock(seed, seedBlock(photoSlugs()));
  if (next !== seed) writeFileSync(SEED, next);
}

const args = new Set(process.argv.slice(2));
if (args.has("--check")) check();
else if (args.has("--seed")) writeSeed();
else {
  // UNSPLASH_ACCESS_KEY, or several apps' keys as UNSPLASH_ACCESS_KEY_1, _2, …
  const keys = Object.entries(process.env)
    .filter(([k, v]) => /^UNSPLASH_ACCESS_KEY(_\d+)?$/.test(k) && v)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => v);
  if (keys.length === 0) {
    console.error(
      "UNSPLASH_ACCESS_KEY is not set (an Unsplash developer app's access key)",
    );
    process.exit(1);
  }
  try {
    await fetchPhotos(keys, args.has("--wait"));
  } catch (e) {
    if (!(e instanceof RateLimited)) throw e;
    console.log(
      "Rate limited: progress saved. Run again in an hour, or pass --wait.",
    );
  } finally {
    writeSeed();
  }
}
