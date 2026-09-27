import { flagshipV7 } from "@cartel/rule-packs/fixtures";
import { describe, expect, it } from "vitest";
import { type StoredOrderRow, storedOrderView } from "./order-view";

async function row(
  over: Partial<StoredOrderRow> = {},
): Promise<StoredOrderRow> {
  const { contract } = await flagshipV7();
  const e = contract.economics;
  return {
    id: "0b58f275-6e13-4b3e-9ac1-6c0fb11b15d9",
    merchantId: "greathub",
    merchantOrderId: "GH-1001",
    status: "created",
    totalMinor: e.merchandiseMinor + e.shippingMinor + e.taxEstimateMinor,
    currency: "USD",
    createdAt: "2026-09-27T10:00:00Z",
    rail: "visa_acceptance",
    card: { brand: "Visa", last4: "1111" },
    planId: contract.planId,
    planTitle: "Home office",
    contractVersion: contract.version,
    contractHash: `sha256:${"a".repeat(64)}`,
    contractBody: contract,
    signedAt: "2026-09-27T09:58:00Z",
    hard: { pass: 7, fail: 0, unknown: 0 },
    ...over,
  };
}

describe("storedOrderView", () => {
  it("prints the signed lines, the charge and how it was paid", async () => {
    const r = await row();
    const view = storedOrderView(r);
    const { contract } = await flagshipV7();
    expect(view.lines).toHaveLength(contract.items.length);
    expect(view.processor).toBe("Visa Acceptance sandbox · Visa •••• 1111");
    expect(view.proof).toBe("7 of 7 hard rules passed");
    expect(view.status).toBe("AUTHORIZED");
    expect(view.id).toBe("GH-1001");
    expect(view.steps.map((s) => [s.label, s.state])).toEqual([
      ["Re-checked", "done"],
      ["Paid", "done"],
      ["Confirmed", "current"],
      ["Shipped", "pending"],
      ["Delivered", "pending"],
    ]);
  });
  it("adds one line when the charge differs from the contract, so it adds up", async () => {
    const base = await row();
    const view = storedOrderView({ ...base, totalMinor: base.totalMinor + 42 });
    expect(view.lines.at(-1)).toEqual({
      label: "Adjusted at checkout",
      amount: "$0.42",
    });
  });
  it("still renders when the contract body can't be read", async () => {
    const view = storedOrderView(await row({ contractBody: {}, hard: null }));
    expect(view.lines).toEqual([]);
    expect(view.proof).toBe("—");
    expect(view.returnPolicy).toBe("—");
  });
});
