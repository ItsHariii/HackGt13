import { contractHash, type Fact } from "@proofcart/contracts";
import {
  FLAGSHIP_BRIEF,
  FLAGSHIP_REQUIREMENTS,
  FLAGSHIP_V8_FACTS,
  VIREO_U2727_DEAL_TRAP_FACTS,
  VIREO_U2727_FACTS,
} from "@proofcart/contracts/fixtures";
import type { ApprovedState, CheckoutState } from "@proofcart/proof-engine";
import { homeOffice } from "../home-office";
import { approveCheckout, UNMODELED_PARENT } from "./approve";
import { demomartCheckout, demomartOffer, specFact } from "./demomart";

/*
 * The flagship home-office demo (SDD §16.1) as checkout states over time:
 *   T7    contract v7 signed: Vireo U2727, webcam $49, total $896.05, max $910
 *   T1    event 1: webcam $49 → $45 (auto under Balanced; total $891.77)
 *   T2    event 2, the deal trap: U2727 $329 → $319 and USB-C 90 W → 15 W on
 *         the same SKU (block; the total would have been $881.07)
 *   T8    contract v8: Halden M27Q-USBC, total $870.37, max $885
 * Product facts are the ones pinned in @proofcart/contracts/fixtures.
 */

export const FLAGSHIP_T7 = "2026-09-26T14:02:11Z";
export const FLAGSHIP_T_WEBCAM = "2026-09-26T14:05:00Z";
export const FLAGSHIP_T_TRAP = "2026-09-26T14:10:05Z";
export const FLAGSHIP_T8 = "2026-09-26T14:12:11Z";

const MONDAY = "2026-09-28";
const SUNDAY = "2026-09-27";

export const FLAGSHIP_PACKS = [homeOffice];

export const flagshipOffers = {
  desk: demomartOffer({
    id: "dm_off_birchline_465",
    productId: "dm_birchline_465",
    sku: "BL-CD-465",
    gtin: "00812345000108",
    title: 'Birchline Compact Desk 46.5"',
    priceMinor: 22_900,
    deliveryBy: MONDAY,
  }),
  chair: demomartOffer({
    id: "dm_off_kestrel_mesh",
    productId: "dm_kestrel_mesh",
    sku: "KS-MESH-TASK",
    gtin: "00812345000207",
    title: "Kestrel Mesh Task Chair",
    priceMinor: 18_900,
    deliveryBy: SUNDAY,
  }),
  vireo: (priceMinor = 32_900, sellerId = "dm_seller_1") =>
    demomartOffer({
      id: "dm_off_vireo_u2727",
      productId: "dm_vireo_u2727",
      sku: "U2727",
      gtin: "00812345000030",
      title: 'Vireo U2727 27" 4K USB-C Monitor',
      priceMinor,
      deliveryBy: SUNDAY,
      sellerId,
    }),
  vireoE: demomartOffer({
    id: "dm_off_vireo_u2727e",
    productId: "dm_vireo_u2727e",
    sku: "U2727E",
    gtin: "00812345009002",
    title: 'Vireo U2727E 27" 4K Monitor',
    priceMinor: 27_900,
    deliveryBy: SUNDAY,
  }),
  halden: demomartOffer({
    id: "dm_off_halden_m27q",
    productId: "dm_halden_m27q",
    sku: "M27Q-USBC",
    gtin: "00812345000016",
    title: 'Halden M27Q-USBC 27" 4K USB-C Monitor',
    priceMinor: 30_900,
    deliveryBy: SUNDAY,
  }),
  cable: demomartOffer({
    id: "dm_off_loop_100w_2m",
    productId: "dm_loop_100w_2m",
    sku: "LOOP-C100-2M",
    gtin: "00812345000405",
    title: "Loop USB-C Cable 100 W, 2 m",
    priceMinor: 1_900,
    deliveryBy: SUNDAY,
  }),
  webcam: (priceMinor = 4_900) =>
    demomartOffer({
      id: "dm_off_pica_1080",
      productId: "dm_pica_1080",
      sku: "PICA-1080",
      gtin: "00812345000504",
      title: "Pica 1080p Webcam",
      priceMinor,
      deliveryBy: SUNDAY,
    }),
};

/** The economy variant: same size and resolution, but only 15 W over USB-C. */
export const VIREO_U2727E_FACTS: Fact[] = [
  specFact("f_vireo_e_diag", "dm_vireo_u2727e", "monitor.diagonal", {
    value: 27,
    unit: "in",
  }),
  specFact("f_vireo_e_res", "dm_vireo_u2727e", "monitor.resolution", "4k"),
  specFact(
    "f_vireo_e_pd",
    "dm_vireo_u2727e",
    "monitor.usb_c_pd_watts",
    { value: 15, unit: "W" },
    {
      raw: "USB-C 15 W",
    },
  ),
];

export type FlagshipCheckoutInit = {
  now: string;
  monitor?: "vireo" | "vireo_e" | "halden";
  vireoMinor?: number;
  vireoSeller?: string;
  vireoFacts?: readonly Fact[];
  webcamMinor?: number;
};

export function flagshipCheckout(init: FlagshipCheckoutInit): CheckoutState {
  const f = FLAGSHIP_V8_FACTS;
  const monitor =
    init.monitor === "halden"
      ? { offer: flagshipOffers.halden, facts: f.monitor ?? [] }
      : init.monitor === "vireo_e"
        ? { offer: flagshipOffers.vireoE, facts: VIREO_U2727E_FACTS }
        : {
            offer: flagshipOffers.vireo(init.vireoMinor, init.vireoSeller),
            facts: init.vireoFacts ?? VIREO_U2727_FACTS,
          };
  return demomartCheckout(
    [
      { role: "desk", offer: flagshipOffers.desk, facts: f.desk ?? [] },
      { role: "chair", offer: flagshipOffers.chair, facts: f.chair ?? [] },
      { role: "monitor", ...monitor },
      { role: "cable", offer: flagshipOffers.cable, facts: f.cable ?? [] },
      {
        role: "webcam",
        offer: flagshipOffers.webcam(init.webcamMinor),
        facts: f.webcam ?? [],
      },
    ],
    { now: init.now },
  );
}

/** The four moments of the flagship demo. */
export const flagshipStates = {
  v7: () => flagshipCheckout({ now: FLAGSHIP_T7 }),
  webcamDrop: () =>
    flagshipCheckout({ now: FLAGSHIP_T_WEBCAM, webcamMinor: 4_500 }),
  dealTrap: () =>
    flagshipCheckout({
      now: FLAGSHIP_T_TRAP,
      webcamMinor: 4_500,
      vireoMinor: 31_900,
      vireoFacts: VIREO_U2727_DEAL_TRAP_FACTS,
    }),
  v8: () =>
    flagshipCheckout({
      now: FLAGSHIP_T8,
      monitor: "halden",
      webcamMinor: 4_500,
    }),
};

const COMFORT_WAIVER = {
  requirementId: "r_chair_comfort",
  acceptedState: "unknown",
  reason: "subjective",
} as const;

/** Contract v7 as signed, with its mandate "execute when the U2727 is ≤ $320, before Mon Sep 28". */
export function flagshipV7(): Promise<ApprovedState> {
  return approveCheckout({
    contractId: "c_flagship",
    version: 7,
    parentHash: UNMODELED_PARENT,
    planId: "p_flagship",
    brief: FLAGSHIP_BRIEF,
    requirements: FLAGSHIP_REQUIREMENTS,
    checkout: flagshipStates.v7(),
    packs: FLAGSHIP_PACKS,
    now: FLAGSHIP_T7,
    maxTotalMinor: 91_000,
    waivers: [COMFORT_WAIVER],
    mandate: {
      trigger: { type: "price_lte", sku: "U2727", amountMinor: 32_000 },
      notAfter: "2026-09-28T04:00:00Z",
    },
    issuedAt: "2026-09-26T14:02:30Z",
    expiresAt: "2026-09-28T04:00:00Z",
  });
}

/** Contract v8, the revision signed after the deal trap. Mirrors FLAGSHIP_CONTRACT_V8. */
export async function flagshipV8(): Promise<ApprovedState> {
  const v7 = await flagshipV7();
  return approveCheckout({
    contractId: "c_flagship",
    version: 8,
    parentHash: await contractHash(v7.contract),
    planId: "p_flagship",
    brief: FLAGSHIP_BRIEF,
    requirements: FLAGSHIP_REQUIREMENTS,
    checkout: flagshipStates.v8(),
    packs: FLAGSHIP_PACKS,
    now: FLAGSHIP_T8,
    maxTotalMinor: 88_500,
    waivers: [COMFORT_WAIVER],
    issuedAt: "2026-09-26T14:12:30Z",
    expiresAt: "2026-09-26T14:27:30Z",
  });
}
