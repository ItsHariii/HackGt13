import type { Box, Fact } from "@cartel/contracts";
import { packDefaults } from "@cartel/proof-engine";
import { travel } from "../travel";
import { greathubOffer, specFact } from "./greathub";

/*
 * "Carry-on" (SDD §16.1): the Fieldnote 21" (21.5 × 14 × 9 in) passes a
 * 22 × 14 × 9 in limit; the Atlas "International" is 10.8 in deep and fails.
 * Volt power banks: 20K ≈ 74 Wh (estimate, 3.7 V assumed) passes; 30K ≈
 * 111 Wh fails 100 Wh; 26.8K states 99.16 Wh itself; 10K states 3.85 V.
 */

export const CARRY_ON_NOW = "2026-09-26T16:00:00Z";
export const CARRY_ON_LIMIT: Box = { dims: [22, 14, 9], unit: "in" };
export const CARRY_ON_PACKS = [travel];

export const CARRY_ON_REQUIREMENTS = packDefaults(travel, {
  bagLimit: CARRY_ON_LIMIT,
  plug: "G",
  voltage: { value: 230, unit: "V" },
});

type Item = {
  role: string;
  offer: ReturnType<typeof greathubOffer>;
  facts: Fact[];
};

function item(
  role: string,
  key: string,
  sku: string,
  title: string,
  priceMinor: number,
  facts: [string, Fact["value"], string?][],
): Item {
  const productId = `dm_${key}`;
  return {
    role,
    offer: greathubOffer({
      id: `dm_off_${key}`,
      productId,
      sku,
      title,
      priceMinor,
      deliveryBy: "2026-10-01",
    }),
    facts: facts.map(([field, value, raw], i) =>
      specFact(`f_${key}_${i}`, productId, field, value, raw ? { raw } : {}),
    ),
  };
}

export const carryOnItems = {
  fieldnote: item(
    "bag",
    "fieldnote_21",
    "FN-21-CO",
    'Fieldnote 21" Carry-On',
    18_900,
    [
      [
        "bag.dimensions",
        { dims: [21.5, 14, 9], unit: "in" },
        "21.5 x 14 x 9 in",
      ],
    ],
  ),
  atlas: item(
    "bag",
    "atlas_intl",
    "AT-INTL-CO",
    'Atlas "International" Carry-On',
    22_900,
    [
      [
        "bag.dimensions",
        { dims: [21.7, 13.8, 10.8], unit: "in" },
        "21.7 x 13.8 x 10.8 in",
      ],
    ],
  ),
  volt10k: item(
    "power_bank",
    "volt_10k",
    "VOLT-10K",
    "Volt 10K Power Bank",
    2_900,
    [
      ["power_bank.capacity_mah", { value: 10_000, unit: "mAh" }, "10,000mAh"],
      ["power_bank.nominal_voltage", { value: 3.85, unit: "V" }, "3.85 V"],
    ],
  ),
  volt20k: item(
    "power_bank",
    "volt_20k",
    "VOLT-20K",
    "Volt 20K Power Bank",
    4_900,
    [["power_bank.capacity_mah", { value: 20_000, unit: "mAh" }, "20,000mAh"]],
  ),
  volt26k: item(
    "power_bank",
    "volt_26k8",
    "VOLT-26K8",
    "Volt 26.8K Power Bank",
    5_900,
    [
      ["power_bank.capacity_mah", { value: 26_800, unit: "mAh" }, "26,800 mAh"],
      ["power_bank.energy_wh", { value: 99.16, unit: "Wh" }, "99.16 Wh"],
    ],
  ),
  volt30k: item(
    "power_bank",
    "volt_30k",
    "VOLT-30K",
    "Volt 30K Power Bank",
    6_900,
    [["power_bank.capacity_mah", { value: 30_000, unit: "mAh" }, "30,000mAh"]],
  ),
  ukAdapter: item(
    "adapter",
    "plug_uk",
    "PLUG-UK",
    "Volt UK Travel Adapter",
    1_500,
    [["adapter.plug_types", ["G"], "Type G"]],
  ),
  euAdapter: item(
    "adapter",
    "plug_eu",
    "PLUG-EU",
    "Volt EU Travel Adapter",
    1_500,
    [["adapter.plug_types", ["C", "F"], "Type C/F"]],
  ),
  laptopCharger: item(
    "device",
    "charger_65w",
    "VOLT-CHG-65",
    "Volt 65 W Charger",
    3_900,
    [
      [
        "device.input_voltage",
        { min: { value: 100, unit: "V" }, max: { value: 240, unit: "V" } },
        "100-240V",
      ],
    ],
  ),
  usHairDryer: item(
    "device",
    "dryer_us",
    "DRY-US-120",
    "Travel Hair Dryer (US)",
    2_900,
    [
      [
        "device.input_voltage",
        { min: { value: 110, unit: "V" }, max: { value: 125, unit: "V" } },
        "110-125V",
      ],
    ],
  ),
  bottle34: item(
    "toiletry",
    "bottle_34",
    "BTL-34",
    "Travel Bottle 3.4 oz",
    600,
    [["toiletry.volume", { value: 3.4, unit: "fl_oz" }, "3.4 oz"]],
  ),
  bottle150: item(
    "toiletry",
    "bottle_150",
    "BTL-150",
    "Travel Bottle 150 ml",
    700,
    [["toiletry.volume", { value: 150, unit: "ml" }, "150ml"]],
  ),
};
