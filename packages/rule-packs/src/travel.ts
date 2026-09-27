import { decimal, definePack, isQuantity } from "@cartel/proof-engine";

/*
 * Travel (SDD §8.3, §16.1 "Carry-on"): bag dimensions against an airline
 * limit in any orientation; power-bank energy Wh = mAh × V / 1000 (3.7 V
 * assumed when the cell voltage isn't stated, which caps the result at
 * `estimated`) and ≤ 100 Wh; plug type for the destination; the device's
 * input voltage range covers the destination voltage; liquids ≤ 100 ml.
 */

/** Nominal lithium-ion cell voltage, used only when a power bank doesn't state its own. */
export const NOMINAL_CELL_VOLTAGE = "3.7";

export const travel = definePack({
  id: "travel",
  version: "1.0.0",
  title: "Travel",
  fields: {
    "bag.dimensions": {
      kind: "length",
      label: "Bag size",
      unit: "in",
      authority: ["manufacturer", "merchant"],
      freshness: "24h",
    },
    "bag.weight": {
      kind: "mass",
      label: "Bag weight",
      unit: "lb",
      authority: ["manufacturer", "merchant"],
    },
    "power_bank.capacity_mah": {
      kind: "charge",
      label: "Capacity",
      unit: "mAh",
      authority: ["manufacturer", "merchant"],
      freshness: "24h",
    },
    "power_bank.nominal_voltage": {
      kind: "voltage",
      label: "Cell voltage",
      unit: "V",
      authority: ["manufacturer"],
    },
    "power_bank.energy_wh": {
      kind: "energy",
      label: "Battery energy",
      unit: "Wh",
      authority: ["manufacturer"],
      freshness: "24h",
    },
    "adapter.plug_types": {
      kind: "list",
      label: "Plug types",
      authority: ["manufacturer", "merchant"],
    },
    "device.input_voltage": {
      kind: "voltage",
      label: "Input voltage",
      unit: "V",
      authority: ["manufacturer"],
    },
    // TSA's "3.4 oz (100 ml)": 3.4 US fl oz is 100.55 ml, so allow 1 ml.
    "toiletry.volume": {
      kind: "volume",
      label: "Container size",
      unit: "ml",
      tolerance: { value: 1, unit: "ml" },
      authority: ["manufacturer", "merchant"],
    },
  },
  jsonLd: {
    "product.pack_size": ["additionalProperty[name=Pack size].value"],
    "bag.dimensions": ["additionalProperty[name=Dimensions].value", "size"],
    "bag.weight": ["weight"],
    "power_bank.capacity_mah": ["additionalProperty[name=Capacity].value"],
    "power_bank.energy_wh": [
      "additionalProperty[name=Energy].value",
      "additionalProperty[name=Watt-hours].value",
    ],
    "adapter.plug_types": ["additionalProperty[name=Plug types].value"],
    "device.input_voltage": ["additionalProperty[name=Input voltage].value"],
    "toiletry.volume": ["additionalProperty[name=Volume].value", "size"],
  },
  roles: [
    { role: "bag", label: "Bag", required: false },
    { role: "power_bank", label: "Power bank", required: false },
    { role: "adapter", label: "Travel adapter", required: false },
    { role: "device", label: "Device", required: false },
    { role: "toiletry", label: "Toiletry bottle", required: false },
  ],
  derive: [
    {
      id: "wh_from_mah",
      scope: "item",
      output: "power_bank.energy_wh",
      inputs: ["power_bank.capacity_mah", "power_bank.nominal_voltage"],
      compute(item) {
        const mah = item.get("power_bank.capacity_mah");
        if (
          mah.state === "unknown" ||
          !isQuantity(mah.value) ||
          mah.value.unit !== "mAh"
        )
          return null;
        const volts = item.get("power_bank.nominal_voltage");
        const stated =
          volts.state !== "unknown" &&
          isQuantity(volts.value) &&
          volts.value.unit === "V";
        const v = decimal.decOf(
          stated
            ? (volts.value as { value: number }).value
            : NOMINAL_CELL_VOLTAGE,
        );
        const wh = decimal.div(
          decimal.mul(decimal.decOf(mah.value.value), v),
          decimal.decOf(1000),
        );
        return {
          value: { value: decimal.toNumber(wh), unit: "Wh" },
          from: stated ? [mah, volts] : [mah],
          assumptions: stated
            ? []
            : [`nominal_cell_voltage_${NOMINAL_CELL_VOLTAGE}V`],
        };
      },
    },
  ],
  defaults: [
    {
      ruleId: "carry_on_size",
      build: (p) =>
        p.bagLimit === undefined
          ? null
          : {
              scope: "item",
              role: "bag",
              field: "bag.dimensions",
              op: "lte",
              target: p.bagLimit,
              importance: "hard",
              minStateToPass: "source_stated",
              materiality: "on_verdict_change",
            },
    },
    {
      ruleId: "power_bank_wh",
      build: () => ({
        scope: "item",
        role: "power_bank",
        field: "power_bank.energy_wh",
        op: "lte",
        target: { value: 100, unit: "Wh" },
        importance: "hard",
        minStateToPass: "estimated",
        materiality: "on_verdict_change",
      }),
    },
    {
      ruleId: "plug_type",
      build: (p) =>
        typeof p.plug !== "string"
          ? null
          : {
              scope: "item",
              role: "adapter",
              field: "adapter.plug_types",
              op: "contains",
              target: p.plug,
              importance: "hard",
              minStateToPass: "source_stated",
              materiality: "on_verdict_change",
            },
    },
    {
      ruleId: "input_voltage",
      build: (p) =>
        p.voltage === undefined
          ? null
          : {
              scope: "item",
              role: "device",
              field: "device.input_voltage",
              op: "contains",
              target: p.voltage,
              importance: "hard",
              minStateToPass: "source_stated",
              materiality: "on_verdict_change",
            },
    },
    {
      ruleId: "liquids",
      build: () => ({
        scope: "item",
        role: "toiletry",
        field: "toiletry.volume",
        op: "lte",
        target: { value: 100, unit: "ml" },
        importance: "hard",
        minStateToPass: "source_stated",
        materiality: "on_verdict_change",
      }),
    },
  ],
});
