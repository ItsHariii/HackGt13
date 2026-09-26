import { describe, expect, it } from "vitest";
import { priceCart, taxOf } from "./pricing";

const policy = { shippingFlatMinor: 2400, taxRateBps: 700 };
const line = (unitPriceMinor: number, quantity = 1, shippingFeeMinor = 0) => ({
  unitPriceMinor,
  quantity,
  shippingFeeMinor,
});

describe("priceCart (SDD §16.1)", () => {
  it("prices the flagship basket at $896.05", () => {
    const cart = priceCart(
      [line(22900), line(18900), line(32900), line(1900), line(4900)],
      policy,
    );
    expect(cart).toMatchObject({
      itemsBaseMinor: 81500,
      fulfillmentMinor: 2400,
      taxMinor: 5705,
      totalMinor: 89605,
    });
  });
  it("prices contract v8 at $870.37 and the webcam change at $891.77", () => {
    expect(
      priceCart(
        [line(22900), line(18900), line(30900), line(1900), line(4500)],
        policy,
      ).totalMinor,
    ).toBe(87037);
    expect(
      priceCart(
        [line(22900), line(18900), line(32900), line(1900), line(4500)],
        policy,
      ).totalMinor,
    ).toBe(89177);
  });
  it("prices the blocked deal-trap state at $881.07", () => {
    expect(
      priceCart(
        [line(22900), line(18900), line(31900), line(1900), line(4500)],
        policy,
      ).totalMinor,
    ).toBe(88107);
  });
  it("allocates tax so line taxes always sum to the order tax", () => {
    for (let seed = 1; seed < 200; seed++) {
      const lines = Array.from({ length: (seed % 5) + 1 }, (_, i) =>
        line(((seed * 7919 + i * 104729) % 50000) + 1, (i % 3) + 1),
      );
      const cart = priceCart(lines, { shippingFlatMinor: 0, taxRateBps: 725 });
      expect(cart.lines.reduce((a, l) => a + l.taxMinor, 0)).toBe(
        cart.taxMinor,
      );
      expect(cart.lines.reduce((a, l) => a + l.totalMinor, 0)).toBe(
        cart.itemsBaseMinor + cart.taxMinor,
      );
    }
  });
  it("adds per-item surcharges to the flat shipping charge, once per order", () => {
    expect(
      priceCart([line(1000, 2, 995), line(500)], policy).fulfillmentMinor,
    ).toBe(3395);
    expect(priceCart([], policy).totalMinor).toBe(0);
  });
  it("rounds half up and rejects fractional cents", () => {
    expect(taxOf(50, 700)).toBe(4); // 3.5 → 4
    expect(taxOf(7, 700)).toBe(0); // 0.49 → 0
    expect(() => priceCart([line(10.5)], policy)).toThrow(RangeError);
    expect(() => priceCart([line(100, 0)], policy)).toThrow(RangeError);
  });
});
