/*
 * Which rule pack a brief is about (TASKS T11.1: "pack auto-detection shown
 * as a chip"). A deterministic keyword score, so /new can show the chip
 * as the person types, with or without the AI layer. The person can
 * always change it; it only picks the default rules offered.
 */

export type PackId = "home-office" | "apparel" | "travel" | "grocery" | "party";

export const PACK_TITLE: Record<PackId, string> = {
  "home-office": "Home office",
  apparel: "Apparel",
  travel: "Travel",
  grocery: "Grocery",
  party: "Party",
};

const KEYWORDS: Record<PackId, readonly string[]> = {
  "home-office": [
    "desk",
    "monitor",
    "chair",
    "office",
    "webcam",
    "usb-c",
    "keyboard",
    "dock",
    "macbook",
    "laptop",
    "alcove",
  ],
  apparel: [
    "shirt",
    "dress",
    "wedding",
    "outfit",
    "shoes",
    "linen",
    "jacket",
    "size",
    "navy",
    "wear",
    "pants",
    "suit",
  ],
  travel: [
    "carry-on",
    "carry on",
    "flight",
    "airline",
    "luggage",
    "suitcase",
    "power bank",
    "travel",
    "trip",
    "adapter",
    "liquids",
    "toiletr",
  ],
  grocery: [
    "grocer",
    "allerg",
    "gluten",
    "peanut",
    "dairy",
    "snack",
    "cereal",
    "food",
    "ingredient",
  ],
  party: [
    "party",
    "birthday",
    "cake",
    "cupcake",
    "balloon",
    "decoration",
    "plates",
    "guests",
    "celebrat",
  ],
};

/** The best-matching pack, or null when nothing matches (or it's a tie). */
export function detectPack(brief: string): PackId | null {
  const text = brief.toLowerCase();
  const scores = (Object.keys(KEYWORDS) as PackId[])
    .map((id) => ({
      id,
      score: KEYWORDS[id].filter((k) =>
        new RegExp(`(^|[^a-z])${k.replace(/[-\s]/g, "[-\\s]?")}`).test(text),
      ).length,
    }))
    .sort((a, b) => b.score - a.score);
  const [first, second] = scores;
  if (!first || first.score === 0) return null;
  if (second && second.score === first.score) return null;
  return first.id;
}

export type BriefTemplate = {
  id: string;
  label: string;
  pack: PackId;
  brief: string;
};

/** The template chips on /new (Brief design). */
export const TEMPLATES: readonly BriefTemplate[] = [
  {
    id: "home-office",
    label: "Home office",
    pack: "home-office",
    brief:
      "Build my home office for under $1,000. The desk has to fit a 48-inch alcove, I want a 27-inch 4K monitor that charges my MacBook over one USB-C cable, and everything has to arrive by Monday. Don't substitute anything without asking.",
  },
  {
    id: "wedding-guest",
    label: "Wedding guest",
    pack: "apparel",
    brief:
      "I need a navy outfit for a wedding on Friday Oct 9, under $250. It has to arrive by Wednesday and be returnable, so I can still exchange sizes before Friday.",
  },
  {
    id: "carry-on",
    label: "Carry-on kit",
    pack: "travel",
    brief:
      "Pack me a carry-on kit for a flight to London: a bag that fits the overhead bin, a power bank the airline allows, travel bottles under 100 ml and a UK plug adapter.",
  },
  {
    id: "birthday-party",
    label: "Birthday party",
    pack: "party",
    brief:
      "A dinosaur birthday party for 12 kids on Saturday Oct 10, under $150. One guest can't have nuts and another is gluten-free, so the cake has to be safe for both. Plates and cups for everyone.",
  },
  {
    id: "linen-shirt",
    label: "Linen shirt",
    pack: "apparel",
    brief:
      "A navy linen shirt, at least 90% linen, under $80, that I can return for free.",
  },
];
