import "server-only";
import type { CatalogProduct } from "@cartel/catalog";
import type { Fact, Offer, Requirement } from "@cartel/contracts";
import {
  FLAGSHIP_REQUIREMENTS,
  FLAGSHIP_V8_FACTS,
  VIREO_U2727_FACTS,
} from "@cartel/contracts/fixtures";
import type { SourceRecord } from "@cartel/evidence";
import {
  CARRY_ON_REQUIREMENTS,
  carryOnItems,
  FLAGSHIP_T8,
  flagshipOffers,
  VIREO_U2727E_FACTS,
  WEDDING_REQUIREMENTS,
  weddingCheckout,
} from "@cartel/rule-packs/fixtures";

/*
 * The demo catalog: the fixture products (flagship home office, wedding,
 * carry-on) in the same CatalogProduct shape the real catalog returns, so
 * Explore, search, product and kit pages render both through one path.
 * Used when the catalog database isn't connected, and always for the
 * `dm_…` product IDs of the demo plan.
 *
 * Each product has two sources: GreatHub's listing (merchant authority,
 * "Seller says") and a seeded spec sheet that stands in for the
 * manufacturer, as SDD §11.2 allows (source type `fixture`), with the same
 * values. Seeded sources say so in their name.
 */

export const DEMO_NOW = FLAGSHIP_T8;
const FETCHED = "2026-09-26T14:02:05Z";

type Line = { role: string; offer: Offer; facts: readonly Fact[] };

const BRANDS = [
  "Birchline",
  "Kestrel",
  "Vireo",
  "Halden",
  "Loop",
  "Pica",
  "Fieldnote",
  "Atlas",
  "Marlow",
  "Aster",
  "Volt",
];

function source(
  id: string,
  sourceType: SourceRecord["sourceType"],
  url: string,
): SourceRecord {
  return {
    id,
    url,
    sourceType,
    contentHash: `sha256:${"0".repeat(64)}`,
    contentType: "application/ld+json",
    storagePath: null,
    httpStatus: 200,
    fetchedAt: FETCHED,
  };
}

function product(line: Line, category: string): CatalogProduct {
  const { offer } = line;
  const listing = source(
    `src_${offer.productId}_jsonld`,
    "json_ld",
    offer.url ?? "https://greathub.example",
  );
  const sheet = source(
    `src_${offer.productId}_sheet`,
    "fixture",
    `Spec sheet (seeded) · ${offer.title.split(" ")[0]}`,
  );
  const listed = line.facts.map((f) => ({ ...f, sourceId: listing.id }));
  const sheetFacts = line.facts
    .filter((f) => f.state !== "unknown" && f.value !== null)
    .map((f) => ({
      ...f,
      id: `${f.id}_sheet`,
      sourceId: sheet.id,
      extractor: "fixture",
    }));
  return {
    id: offer.productId,
    identityKey: offer.gtin ? `gtin:${offer.gtin}` : `sku:${offer.sku}`,
    title: offer.title,
    brand: BRANDS.find((b) => offer.title.startsWith(b)) ?? null,
    gtin: offer.gtin ?? null,
    mpn: offer.sku,
    upid: null,
    category,
    roles: [line.role],
    imageUrl: null,
    attributes: {},
    refs: [
      { source: "greathub", externalId: offer.sku, url: offer.url ?? null },
    ],
    offers: [
      {
        id: offer.id,
        source: "greathub",
        externalId: offer.sku,
        merchant: "greathub",
        sellerId: offer.sellerId,
        priceMinor: offer.price.amountMinor,
        currency: offer.price.currency,
        shippingMinor: 2400,
        availability: offer.availability,
        referenceOnly: false,
        retrievedAt: FETCHED,
        freshUntil: "2026-09-27T14:02:05Z",
        url: offer.url ?? null,
        tier: "full",
      },
    ],
    facts: [...listed, ...sheetFacts],
    sources: [listing, sheet],
    rank: 0,
    proof: [],
  };
}

const f = FLAGSHIP_V8_FACTS;
const wedding = weddingCheckout();
const weddingLines: Line[] = wedding.basket.lines.flatMap((l) => {
  const offer = wedding.offers.find((o) => o.id === l.offerId);
  return offer
    ? [
        {
          role: l.role,
          offer,
          facts: wedding.facts.filter(
            (x) =>
              x.subjectKind === "product" && x.subjectId === offer.productId,
          ),
        },
      ]
    : [];
});

export const DEMO_PRODUCTS: CatalogProduct[] = [
  product(
    { role: "monitor", offer: flagshipOffers.halden, facts: f.monitor ?? [] },
    "Monitors",
  ),
  product(
    {
      role: "monitor",
      offer: flagshipOffers.vireo(),
      facts: VIREO_U2727_FACTS,
    },
    "Monitors",
  ),
  product(
    {
      role: "monitor",
      offer: flagshipOffers.vireoE,
      facts: VIREO_U2727E_FACTS,
    },
    "Monitors",
  ),
  product(
    { role: "desk", offer: flagshipOffers.desk, facts: f.desk ?? [] },
    "Desks",
  ),
  product(
    { role: "chair", offer: flagshipOffers.chair, facts: f.chair ?? [] },
    "Chairs",
  ),
  product(
    { role: "cable", offer: flagshipOffers.cable, facts: f.cable ?? [] },
    "Cables",
  ),
  product(
    { role: "webcam", offer: flagshipOffers.webcam(), facts: f.webcam ?? [] },
    "Webcams",
  ),
  ...weddingLines.map((l) =>
    product(l, l.role === "shoes" ? "Shoes" : "Dresses"),
  ),
  ...Object.values(carryOnItems).map((l) => product(l, "Travel")),
];

export function demoProduct(id: string): CatalogProduct | null {
  return DEMO_PRODUCTS.find((p) => p.id === id) ?? null;
}

/** A plain word match over title, brand and category, for the demo search. */
export function demoSearch(query: string): CatalogProduct[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return DEMO_PRODUCTS.filter((p) => {
    const hay =
      `${p.title} ${p.brand ?? ""} ${p.category ?? ""} ${p.roles.join(" ")}`.toLowerCase();
    return words.some((w) => hay.includes(w.replace(/s$/, "")));
  });
}

export type DemoKit = {
  slug: string;
  title: string;
  pack: string;
  description: string;
  requirements: Requirement[];
  items: { role: string; productId: string }[];
};

/** The Explore kits (mirrors supabase/seed.sql) for when the database isn't connected. */
export const DEMO_KITS: DemoKit[] = [
  {
    slug: "starter-home-office",
    title: "Starter home office",
    pack: "home-office",
    description:
      'A desk that fits the space, a 27" 4K monitor that charges your laptop over one cable, and a chair with lumbar support.',
    requirements: FLAGSHIP_REQUIREMENTS.filter((r) => r.id !== "r_delivery"),
    items: [
      { role: "desk", productId: "dm_birchline_465" },
      { role: "chair", productId: "dm_kestrel_mesh" },
      { role: "monitor", productId: "dm_vireo_u2727" },
      { role: "cable", productId: "dm_loop_100w_2m" },
      { role: "webcam", productId: "dm_pica_1080" },
    ],
  },
  {
    slug: "wedding-guest",
    title: "Wedding guest",
    pack: "apparel",
    description:
      "A navy dress and shoes that arrive with time to exchange, and stay returnable.",
    requirements: WEDDING_REQUIREMENTS,
    items: weddingLines.map((l) => ({
      role: l.role,
      productId: l.offer.productId,
    })),
  },
  {
    slug: "carry-on-kit",
    title: "Carry-on kit",
    pack: "travel",
    description:
      "A bag that fits the overhead bin, a power bank the airline allows, and liquids under the limit.",
    requirements: CARRY_ON_REQUIREMENTS,
    items: Object.values(carryOnItems).map((l) => ({
      role: l.role,
      productId: l.offer.productId,
    })),
  },
];
