import type { Box } from "@proofcart/contracts";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  add,
  dec,
  decOf,
  div,
  mul,
  roundHalfEven,
  roundHalfUp,
  toNumber,
  toText,
} from "./decimal";
import {
  addMoney,
  applyRate,
  compareMoney,
  MoneyError,
  money,
  parseMoney,
  sumMoney,
  timesQty,
} from "./money";
import { boxFits, compareQuantity, convert, toBase } from "./units";

const usd = (n: number) => money(n, "USD");

describe("decimal", () => {
  it("reads numbers through their shortest string, so 0.1 + 0.2 is exactly 0.3", () => {
    expect(toText(add(decOf(0.1), decOf(0.2)))).toBe("0.3");
    expect(toText(mul(decOf("20000"), decOf("3.7")))).toBe("74000");
    expect(toText(div(mul(decOf(26800), decOf("3.7")), decOf(1000)))).toBe(
      "99.16",
    );
  });

  it("accepts exponents and rejects non-finite input", () => {
    expect(toText(decOf("2.5e-3"))).toBe("0.0025");
    expect(toText(decOf(1e21))).toBe("1000000000000000000000");
    expect(dec(Number.NaN)).toBeNull();
    expect(dec(Number.POSITIVE_INFINITY)).toBeNull();
    expect(dec("1.2.3")).toBeNull();
    expect(dec("")).toBeNull();
  });

  it("rounds half to even and half up", () => {
    const cases: [string, bigint, bigint][] = [
      ["0.5", 0n, 1n],
      ["1.5", 2n, 2n],
      ["2.5", 2n, 3n],
      ["-2.5", -2n, -3n],
      ["2.4999", 2n, 2n],
      ["2.5001", 3n, 3n],
    ];
    for (const [text, even, up] of cases) {
      expect(roundHalfEven(decOf(text))).toBe(even);
      expect(roundHalfUp(decOf(text))).toBe(up);
    }
  });
});

describe("units", () => {
  it("converts exactly between units of a dimension", () => {
    expect(toNumber(toBase({ value: 48, unit: "in" }) ?? decOf(0))).toBe(
      1219.2,
    );
    expect(convert({ value: 3.4, unit: "fl_oz" }, "ml")?.value).toBeCloseTo(
      100.55,
      2,
    );
    expect(convert({ value: 118, unit: "cm" }, "in")?.value).toBeCloseTo(
      46.4567,
      4,
    );
    expect(convert({ value: 1, unit: "W" }, "in")).toBeNull();
  });

  it("compares within tolerance (dimensions ±0.5 mm)", () => {
    const tol = { value: 0.5, unit: "mm" } as const;
    expect(
      compareQuantity(
        { value: 68.6, unit: "cm" },
        { value: 27, unit: "in" },
        tol,
      ),
    ).toBe(0);
    expect(
      compareQuantity(
        { value: 48.01, unit: "in" },
        { value: 48, unit: "in" },
        tol,
      ),
    ).toBe(0);
    expect(
      compareQuantity(
        { value: 48.05, unit: "in" },
        { value: 48, unit: "in" },
        tol,
      ),
    ).toBe(1);
    expect(
      compareQuantity({ value: 65, unit: "W" }, { value: 65, unit: "Wh" }),
    ).toBeNull();
  });

  it("checks a box against a limit in any orientation", () => {
    const limit: Box = { dims: [22, 14, 9], unit: "in" };
    expect(boxFits({ dims: [9, 21.5, 14], unit: "in" }, limit)?.fits).toBe(
      true,
    );
    const atlas = boxFits({ dims: [21.7, 13.8, 10.8], unit: "in" }, limit);
    expect(atlas?.fits).toBe(false);
    expect(atlas?.overBy.map((v) => Math.round(v * 10) / 10)).toEqual([
      1.8, 0, 0,
    ]);
    expect(boxFits({ dims: [55, 35, 23], unit: "cm" }, limit)?.fits).toBe(
      false,
    );
  });
});

describe("money", () => {
  it("adds, sums and compares in minor units", () => {
    expect(addMoney(usd(81_500), usd(2_400))).toEqual(usd(83_900));
    expect(
      sumMoney(
        [usd(22_900), usd(18_900), usd(32_900), usd(1_900), usd(4_900)],
        "USD",
      ),
    ).toEqual(usd(81_500));
    expect(sumMoney([], "USD")).toEqual(usd(0));
    expect(timesQty(usd(1_900), 3)).toEqual(usd(5_700));
    expect(compareMoney(usd(1), usd(2))).toBe(-1);
  });

  it("refuses to mix currencies or leave the safe-integer range", () => {
    expect(() => addMoney(usd(1), money(1, "EUR"))).toThrow(MoneyError);
    expect(() => compareMoney(usd(1), money(1, "EUR"))).toThrow(MoneyError);
    expect(() => addMoney(usd(Number.MAX_SAFE_INTEGER), usd(1))).toThrow(
      MoneyError,
    );
    expect(() => timesQty(usd(1), 1.5)).toThrow(MoneyError);
  });

  it("applies tax with banker's rounding by default (SDD §16.1 numbers)", () => {
    expect(applyRate(usd(81_500), "0.07")).toEqual(usd(5_705));
    expect(applyRate(usd(81_100), "0.07")).toEqual(usd(5_677));
    expect(applyRate(usd(80_100), "0.07")).toEqual(usd(5_607));
    expect(applyRate(usd(79_100), "0.07")).toEqual(usd(5_537));
    // 250 × 0.05 = 12.5 → 12 (even) under half-even, 13 under half-up
    expect(applyRate(usd(250), "0.05")).toEqual(usd(12));
    expect(applyRate(usd(250), "0.05", "half_up")).toEqual(usd(13));
    expect(applyRate(usd(10_000), "0.08875")).toEqual(usd(888));
    expect(() => applyRate(usd(1), "-0.1")).toThrow(MoneyError);
  });

  it("Σ lines + fees + tax = total, exactly (SDD §22.1 invariant 7)", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.tuple(
            fc.integer({ min: 0, max: 5_000_000 }),
            fc.integer({ min: 1, max: 20 }),
          ),
          {
            maxLength: 12,
          },
        ),
        fc.integer({ min: 0, max: 100_000 }),
        fc.constantFrom("0", "0.07", "0.0825", "0.10"),
        (lines, shipping, rate) => {
          const merch = sumMoney(
            lines.map(([p, q]) => timesQty(usd(p), q)),
            "USD",
          );
          const tax = applyRate(merch, rate);
          const total = sumMoney([merch, usd(shipping), tax], "USD");
          const expected =
            lines.reduce((s, [p, q]) => s + p * q, 0) +
            shipping +
            tax.amountMinor;
          return (
            Number.isInteger(total.amountMinor) &&
            total.amountMinor === expected
          );
        },
      ),
    );
  });

  it("parses price text", () => {
    expect(parseMoney("$1,000")).toEqual(usd(100_000));
    expect(parseMoney("329.00", "USD")).toEqual(usd(32_900));
    expect(parseMoney("USD 12.5")).toEqual(usd(1_250));
    expect(parseMoney("19.99 EUR")).toEqual(money(1_999, "EUR"));
    expect(parseMoney("329.00")).toBeNull();
    expect(parseMoney("$5 EUR")).toBeNull();
    expect(parseMoney("12.345", "USD")).toBeNull();
    expect(parseMoney("free", "USD")).toBeNull();
  });
});
