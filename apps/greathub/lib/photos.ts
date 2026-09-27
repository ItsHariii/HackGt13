import credits from "@/public/products/credits.json";

/** Who took a product's stock photo (scripts/product-photos.mjs writes the file). */
export type PhotoCredit = {
  id: string;
  query: string;
  photographer: string;
  profile: string;
  page: string;
};

const CREDITS: Readonly<Record<string, PhotoCredit>> = credits;

export function photoCredit(slug: string): PhotoCredit | null {
  return CREDITS[slug] ?? null;
}
