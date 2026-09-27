import { describe, expect, it } from "vitest";
import { checkoutReturn } from "./checkout-return";

const PLAN = "0b58f275-6e13-4b3e-9ac1-6c0fb11b15d9";

describe("checkoutReturn", () => {
  it("accepts a plan's checkout path", () => {
    expect(checkoutReturn(`/plans/${PLAN}/checkout`)).toBe(
      `/plans/${PLAN}/checkout`,
    );
  });
  it.each([
    undefined,
    ["/plans/x/checkout"],
    "//evil.example/plans",
    `https://evil.example/plans/${PLAN}/checkout`,
    `/plans/${PLAN}/checkout/../../settings`,
    `/plans/${PLAN}/contract`,
    "/plans/x/checkout",
  ])("rejects %s", (value) => {
    expect(checkoutReturn(value)).toBeNull();
  });
});
