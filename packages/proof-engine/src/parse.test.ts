import type { Box, Quantity, Range } from "@proofcart/contracts";
import { describe, expect, it } from "vitest";
import {
  type ParseHint,
  parseBox,
  parseMeasure,
  parseQuantity,
  parseRange,
} from "./parse";

type Case = [
  input: string,
  expected: Quantity | Range | Box | null,
  hint?: ParseHint,
];

const q = (
  value: number,
  unit: Quantity["unit"],
  qualifier?: Quantity["qualifier"],
): Quantity => (qualifier ? { value, unit, qualifier } : { value, unit });

const QUANTITIES: Case[] = [
  // SDD §8.2 grammar examples
  ["65W", q(65, "W")],
  ["65 W", q(65, "W")],
  ["65 watts", q(65, "W")],
  ["65 Watt", q(65, "W")],
  ["up to 90 W", q(90, "W", "up_to")],
  ["Up to 90W", q(90, "W", "up_to")],
  ['46.5"', q(46.5, "in")],
  ["46.5 in", q(46.5, "in")],
  ["46.5 in.", q(46.5, "in")],
  ["46.5 inches", q(46.5, "in")],
  ["46.5″", q(46.5, "in")],
  ["46.5”", q(46.5, "in")],
  ["118 cm", q(118, "cm")],
  ["118cm", q(118, "cm")],
  ["20,000mAh", q(20000, "mAh")],
  ["20,000 mAh", q(20000, "mAh")],
  ["26,800 mAh", q(26800, "mAh")],
  ["20k mAh", q(20000, "mAh")],
  ["26.8K mAh", q(26800, "mAh")],
  ["3.4 oz", q(3.4, "oz")],
  ["3.4 oz", q(3.4, "fl_oz"), { dimension: "volume" }],
  ["3.4 fl oz", q(3.4, "fl_oz")],
  ["3.4 fl. oz.", q(3.4, "fl_oz")],
  ["100ml", q(100, "ml")],
  ["100 mL", q(100, "ml")],
  ["1.5 L", q(1.5, "l")],
  ["74 Wh", q(74, "Wh")],
  ["74 watt-hours", q(74, "Wh")],
  ["99.16 watt hours", q(99.16, "Wh")],
  ["2.4 kg", q(2.4, "kg")],
  ["5.3 lbs", q(5.3, "lb")],
  ["12 ft", q(12, "ft")],
  ["5'10\"", q(70, "in")],
  ["5' 10\"", q(70, "in")],
  ["220 V", q(220, "V")],
  ["90%", q(90, "pct")],
  ["30 days", q(30, "day")],
  [".5 in", q(0.5, "in")],
  // qualifiers
  ["approx. 27 in", q(27, "in", "approx")],
  ["about 27 in", q(27, "in", "approx")],
  ["~27 in", q(27, "in", "approx")],
  ["max 100 ml", q(100, "ml", "max")],
  ["100 ml max", q(100, "ml", "max")],
  ["100 ml (max)", q(100, "ml", "max")],
  ["at least 65 W", q(65, "W", "min")],
  ["65W+", q(65, "W", "min")],
  ["≤ 100 Wh", q(100, "Wh", "max")],
  // hints
  ["46.5", q(46.5, "in"), { defaultUnit: "in" }],
  ["46.5", null],
  ["65 W", null, { dimension: "length" }],
  ["46.5", null, { dimension: "power", defaultUnit: "in" }],
  // rejects rather than guesses
  ["", null],
  ["   ", null],
  ["abc", null],
  ["W", null],
  ["65 Z", null],
  ["65 W W", null],
  ["-5 W", null],
  ["1e309 W", null],
  ["NaN W", null],
  ["Infinity W", null],
  ["1,00,0 W", null],
  ["65..5 W", null],
  ["USB-C power delivery up to 90 W", null],
  ["x".repeat(500), null],
];

const RANGES: Case[] = [
  ["100-240V", { min: q(100, "V"), max: q(240, "V") }],
  ["100 V – 240 V", { min: q(100, "V"), max: q(240, "V") }],
  ["100–240 V", { min: q(100, "V"), max: q(240, "V") }],
  ["10 to 20 W", { min: q(10, "W"), max: q(20, "W") }],
  ["between 35.5 and 36.5 in", { min: q(35.5, "in"), max: q(36.5, "in") }],
  ["90 cm - 1 m", { min: q(90, "cm"), max: q(1, "m") }],
  ["240-100V", null],
  ["100 V - 2 A", null],
  ["100-240", null],
];

const BOXES: Case[] = [
  ["21.5 x 14 x 9 in", { dims: [21.5, 14, 9], unit: "in" }],
  ["21.5 × 14 × 9 in", { dims: [21.5, 14, 9], unit: "in" }],
  ['21.5" x 14" x 9"', { dims: [21.5, 14, 9], unit: "in" }],
  ["55x35x23cm", { dims: [55, 35, 23], unit: "cm" }],
  ["22 x 14 x 9", { dims: [22, 14, 9], unit: "in" }, { defaultUnit: "in" }],
  ["22 x 14 x 9", null],
  ["55 cm x 35 in x 23 cm", null],
  ["22 x 14 in", null],
  ["22 x 0 x 9 in", null],
];

describe("parseQuantity", () => {
  it.each(QUANTITIES)("%s", (input, expected, hint) => {
    expect(parseQuantity(input, hint)).toEqual(expected);
  });

  it("never throws on hostile input", () => {
    for (const v of [
      null,
      undefined,
      42,
      {},
      [],
      "\u0000",
      "9".repeat(400),
      "65 W".repeat(60),
    ]) {
      expect(() => parseQuantity(v as unknown as string)).not.toThrow();
    }
  });
});

describe("parseRange", () => {
  it.each(RANGES)("%s", (input, expected, hint) => {
    expect(parseRange(input, hint)).toEqual(expected);
  });
});

describe("parseBox", () => {
  it.each(BOXES)("%s", (input, expected, hint) => {
    expect(parseBox(input, hint)).toEqual(expected);
  });
});

describe("parseMeasure", () => {
  it("tries box, then range, then quantity", () => {
    expect(parseMeasure("21.5 x 14 x 9 in")).toEqual({
      dims: [21.5, 14, 9],
      unit: "in",
    });
    expect(parseMeasure("100-240V")).toEqual({
      min: q(100, "V"),
      max: q(240, "V"),
    });
    expect(parseMeasure("max 65W")).toEqual(q(65, "W", "max"));
  });

  it("has at least 40 table cases", () => {
    expect(
      QUANTITIES.length + RANGES.length + BOXES.length,
    ).toBeGreaterThanOrEqual(40);
  });
});
