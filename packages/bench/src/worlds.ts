import {
  type AutonomyPreset,
  autonomyPolicy,
  type Fact,
  type Offer,
  type Requirement,
  type Waiver,
} from "@cartel/contracts";
import {
  FLAGSHIP_BRIEF,
  FLAGSHIP_REQUIREMENTS,
  FLAGSHIP_V8_FACTS,
  VIREO_U2727_FACTS,
} from "@cartel/contracts/fixtures";
import type { ApprovedState, Pack } from "@cartel/proof-engine";
import {
  approveCheckout,
  CARRY_ON_NOW,
  CARRY_ON_PACKS,
  CARRY_ON_REQUIREMENTS,
  type CheckoutOptions,
  carryOnItems,
  FLAGSHIP_PACKS,
  FLAGSHIP_T7,
  flagshipOffers,
  greathubCheckout,
  greathubOffer,
  type Line,
  UNMODELED_PARENT,
  VIREO_U2727E_FACTS,
  WEDDING_BRIEF,
  WEDDING_NOW,
  WEDDING_PACKS,
  WEDDING_REQUIREMENTS,
  weddingCheckout,
} from "@cartel/rule-packs/fixtures";

/*
 * The signed baskets scenarios start from. A world is the checkout as the
 * user signed it, kept as editable lines (so a mutation regenerates offer
 * facts and the merchant quote the way GreatHub's checkout would), plus the
 * alternatives a swap can pull in and how to write the signed contract.
 */

export type WorldId = "flagship" | "wedding" | "carry-on";

export type Alternative = { offer: Offer; facts: readonly Fact[] };

export type World = {
  id: WorldId;
  packs: readonly Pack[];
  /** When the contract was proved and signed; scenarios default to it. */
  now: string;
  requirements: readonly Requirement[];
  lines: () => Line[];
  checkout: Omit<CheckoutOptions, "now">;
  alternatives: Readonly<Record<string, Alternative>>;
  approve: (preset: AutonomyPreset) => Promise<ApprovedState>;
};

const COMFORT_WAIVER: Waiver = {
  requirementId: "r_chair_comfort",
  acceptedState: "unknown",
  reason: "subjective",
};

function flagshipLines(): Line[] {
  const f = FLAGSHIP_V8_FACTS;
  return [
    { role: "desk", offer: flagshipOffers.desk, facts: f.desk ?? [] },
    { role: "chair", offer: flagshipOffers.chair, facts: f.chair ?? [] },
    {
      role: "monitor",
      offer: flagshipOffers.vireo(),
      facts: VIREO_U2727_FACTS,
    },
    { role: "cable", offer: flagshipOffers.cable, facts: f.cable ?? [] },
    { role: "webcam", offer: flagshipOffers.webcam(), facts: f.webcam ?? [] },
  ];
}

/** Contract v7 of the flagship demo (SDD §16.1): Vireo U2727, total $896.05, max $910. */
const flagship: World = {
  id: "flagship",
  packs: FLAGSHIP_PACKS,
  now: FLAGSHIP_T7,
  requirements: FLAGSHIP_REQUIREMENTS,
  lines: flagshipLines,
  checkout: {},
  alternatives: {
    vireo_e: { offer: flagshipOffers.vireoE, facts: VIREO_U2727E_FACTS },
    halden: {
      offer: flagshipOffers.halden,
      facts: FLAGSHIP_V8_FACTS.monitor ?? [],
    },
    webcam_4k: {
      offer: greathubOffer({
        id: "dm_off_pica_4k",
        productId: "dm_pica_4k",
        sku: "PICA-4K",
        gtin: "00812345000511",
        title: "Pica 4K Webcam",
        priceMinor: 4_900,
        deliveryBy: "2026-09-27",
      }),
      facts: [],
    },
  },
  approve: (preset) =>
    approveCheckout({
      contractId: "c_flagship",
      version: 7,
      parentHash: UNMODELED_PARENT,
      planId: "p_flagship",
      brief: FLAGSHIP_BRIEF,
      requirements: FLAGSHIP_REQUIREMENTS,
      checkout: greathubCheckout(flagshipLines(), { now: FLAGSHIP_T7 }),
      packs: FLAGSHIP_PACKS,
      now: FLAGSHIP_T7,
      maxTotalMinor: 91_000,
      autonomy: autonomyPolicy(preset),
      waivers: [COMFORT_WAIVER],
      issuedAt: "2026-09-26T14:02:30Z",
      expiresAt: "2026-09-28T04:00:00Z",
    }),
};

function weddingLines(): Line[] {
  const base = weddingCheckout();
  return base.basket.lines.map((l) => {
    const offer = base.offers.find((o) => o.id === l.offerId) as Offer;
    return {
      role: l.role,
      offer,
      facts: base.facts.filter(
        (f) => f.subjectKind === "product" && f.subjectId === offer.productId,
      ),
    };
  });
}

/** "Wedding guest" (SDD §16.1): Marlow wrap dress + Aster heels, $242, returnable, by Wed Oct 7. */
const wedding: World = {
  id: "wedding",
  packs: WEDDING_PACKS,
  now: WEDDING_NOW,
  requirements: WEDDING_REQUIREMENTS,
  lines: weddingLines,
  checkout: { shippingMinor: 0, taxRate: "0" },
  alternatives: {
    marlow_l: {
      offer: greathubOffer({
        id: "dm_off_marlow_wrap_navy_l",
        productId: "dm_marlow_wrap_navy",
        sku: "MW-WRAP-NVY-L",
        gtin: "00812345001112",
        variant: "Navy / L",
        title: "Marlow Navy Wrap Dress",
        priceMinor: 16_800,
        deliveryBy: "2026-10-02",
      }),
      facts: weddingLines()[0]?.facts ?? [],
    },
  },
  approve: (preset) =>
    approveCheckout({
      contractId: "c_wedding",
      version: 1,
      parentHash: null,
      planId: "p_wedding",
      brief: WEDDING_BRIEF,
      requirements: WEDDING_REQUIREMENTS,
      checkout: greathubCheckout(weddingLines(), {
        now: WEDDING_NOW,
        shippingMinor: 0,
        taxRate: "0",
      }),
      packs: WEDDING_PACKS,
      now: WEDDING_NOW,
      maxTotalMinor: 25_000,
      autonomy: autonomyPolicy(preset),
      waivers: [
        {
          requirementId: "r_looks",
          acceptedState: "unknown",
          reason: "subjective",
        },
      ],
      issuedAt: "2026-09-26T15:00:30Z",
      expiresAt: "2026-09-26T15:15:30Z",
    }),
};

function carryOnLines(): Line[] {
  const i = carryOnItems;
  return [
    i.fieldnote,
    i.volt10k,
    i.ukAdapter,
    i.laptopCharger,
    { ...i.bottle34, qty: 3 },
  ];
}

const carryOnCheckout = { shippingMinor: 0 };

/** "Carry-on" (SDD §16.1) to the UK: Fieldnote 21", Volt 10K (38.5 Wh at a stated 3.85 V), type G, 230 V, three 3.4 oz bottles. */
const carryOn: World = {
  id: "carry-on",
  packs: CARRY_ON_PACKS,
  now: CARRY_ON_NOW,
  requirements: CARRY_ON_REQUIREMENTS,
  lines: carryOnLines,
  checkout: carryOnCheckout,
  alternatives: {
    atlas: carryOnItems.atlas,
    volt20k: carryOnItems.volt20k,
    volt26k: carryOnItems.volt26k,
    volt30k: carryOnItems.volt30k,
    eu_adapter: carryOnItems.euAdapter,
    us_dryer: carryOnItems.usHairDryer,
    bottle150: carryOnItems.bottle150,
  },
  approve: (preset) =>
    approveCheckout({
      contractId: "c_carry_on",
      version: 1,
      parentHash: null,
      planId: "p_carry_on",
      brief:
        "Carry-on for London: a bag that fits 22 × 14 × 9 in, a power bank I can fly with, a UK plug adapter, a charger that takes 230 V and three travel bottles.",
      requirements: CARRY_ON_REQUIREMENTS,
      checkout: greathubCheckout(carryOnLines(), {
        now: CARRY_ON_NOW,
        ...carryOnCheckout,
      }),
      packs: CARRY_ON_PACKS,
      now: CARRY_ON_NOW,
      maxTotalMinor: 35_000,
      autonomy: autonomyPolicy(preset),
      issuedAt: "2026-09-26T16:00:30Z",
      expiresAt: "2026-09-26T16:15:30Z",
    }),
};

export const WORLDS: Readonly<Record<WorldId, World>> = {
  flagship,
  wedding,
  "carry-on": carryOn,
};
