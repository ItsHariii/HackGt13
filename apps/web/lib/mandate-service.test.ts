import { flagshipV7 } from "@cartel/rule-packs/fixtures";
import { describe, expect, it, vi } from "vitest";
import { CheckoutError } from "./checkout-service";
import {
  evaluateMandate,
  type MandateDeps,
  type MandateRow,
  mandateKey,
  type Observation,
  triggerFired,
} from "./mandate-service";

const NOW = new Date("2026-09-27T12:00:00Z");

function observation(priceMinor: number, availability = "in_stock") {
  return {
    sku: "U2727",
    priceMinor,
    currency: "USD",
    availability,
    retrievedAt: NOW.toISOString(),
  } satisfies Observation;
}

async function setup(overrides: Partial<MandateRow["contract"]> = {}) {
  const { contract } = await flagshipV7();
  const row: MandateRow = {
    id: "m1",
    status: "armed",
    trigger: contract.mandate?.trigger,
    notAfter: contract.mandate?.notAfter ?? "",
    contract: {
      id: "v7",
      status: "armed",
      body: contract,
      owner: "user-1",
      ...overrides,
    },
  };
  const deps = {
    now: () => NOW,
    load: vi.fn(async () => row),
    hasExecution: vi.fn(async () => false),
    observe: vi.fn(async () => observation(31_900)),
    checked: vi.fn(async () => {}),
    fired: vi.fn(async () => {}),
    settle: vi.fn(async () => {}),
    instrumentFor: vi.fn(async (): Promise<string | null> => "instrument-1"),
    checkout: vi.fn<MandateDeps["checkout"]>(async () => ({
      status: "paused",
      classification: "block",
      diffId: "diff-1",
    })),
  } satisfies MandateDeps;
  return { row, deps };
}

describe("triggerFired", () => {
  const price = {
    type: "price_lte",
    sku: "U2727",
    amountMinor: 32_000,
  } as const;
  it("fires at or under the signed price, on the signed SKU only", () => {
    expect(triggerFired(price, observation(32_000))).toBe(true);
    expect(triggerFired(price, observation(32_001))).toBe(false);
    expect(triggerFired(price, { ...observation(100), sku: "OTHER" })).toBe(
      false,
    );
    expect(triggerFired(price, { ...observation(0), priceMinor: null })).toBe(
      false,
    );
  });
  it("back_in_stock fires on in_stock or limited", () => {
    const t = { type: "back_in_stock", sku: "U2727" } as const;
    expect(triggerFired(t, observation(1, "limited"))).toBe(true);
    expect(triggerFired(t, observation(1, "out_of_stock"))).toBe(false);
    expect(triggerFired(t, observation(1, "preorder"))).toBe(false);
  });
});

describe("evaluateMandate", () => {
  it("records a check and stops when the price is still too high", async () => {
    const { deps } = await setup();
    deps.observe.mockResolvedValue(observation(32_900));
    const r = await evaluateMandate({ mandateId: "m1" }, deps);
    expect(r.result).toBe("not_fired");
    expect(deps.observe).toHaveBeenCalledWith("U2727");
    expect(deps.checked).toHaveBeenCalledOnce();
    expect(deps.fired).not.toHaveBeenCalled();
    expect(deps.checkout).not.toHaveBeenCalled();
  });

  it("the deal trap: fires, runs the guarded checkout with the mandate key, and settles blocked", async () => {
    const { deps } = await setup();
    const r = await evaluateMandate({ mandateId: "m1" }, deps);
    expect(deps.fired).toHaveBeenCalledWith("m1", observation(31_900));
    expect(deps.checkout).toHaveBeenCalledWith(
      "v7",
      "user-1",
      mandateKey("m1"),
      "instrument-1",
    );
    expect(r).toEqual({
      result: "fired",
      outcome: { status: "paused", classification: "block", diffId: "diff-1" },
    });
    expect(deps.settle).toHaveBeenCalledWith("m1", "fired_blocked", {
      status: "paused",
      classification: "block",
      diffId: "diff-1",
    });
  });

  it("settles executed when the checkout pays", async () => {
    const { deps } = await setup();
    deps.checkout.mockResolvedValue({
      status: "paid",
      executionId: "e1",
      orderId: "o1",
    });
    await evaluateMandate({ mandateId: "m1" }, deps);
    expect(deps.settle).toHaveBeenCalledWith("m1", "fired_executed", {
      status: "paid",
      executionId: "e1",
      orderId: "o1",
    });
  });

  it("stays armed on an uncertain result, and the retry only reconciles", async () => {
    const { deps } = await setup();
    deps.checkout.mockResolvedValue({
      status: "reconcile_required",
      executionId: "e1",
    });
    await evaluateMandate({ mandateId: "m1" }, deps);
    expect(deps.settle).not.toHaveBeenCalled();

    // Redelivery: the price has gone back up, but the execution exists, so no re-test.
    deps.hasExecution.mockResolvedValue(true);
    deps.observe.mockResolvedValue(observation(40_000));
    deps.fired.mockClear();
    deps.checkout.mockResolvedValue({ status: "paid", executionId: "e1" });
    await evaluateMandate({ mandateId: "m1" }, deps);
    expect(deps.observe).toHaveBeenCalledOnce();
    expect(deps.fired).not.toHaveBeenCalled();
    expect(deps.checkout).toHaveBeenLastCalledWith(
      "v7",
      "user-1",
      mandateKey("m1"),
      "instrument-1",
    );
    expect(deps.settle).toHaveBeenCalledWith("m1", "fired_executed", {
      status: "paid",
      executionId: "e1",
    });
  });

  it("blocks without paying when no card is enrolled", async () => {
    const { deps } = await setup();
    deps.instrumentFor.mockResolvedValue(null);
    await evaluateMandate({ mandateId: "m1" }, deps);
    expect(deps.checkout).not.toHaveBeenCalled();
    expect(deps.settle).toHaveBeenCalledWith("m1", "fired_blocked", {
      status: "no_instrument",
    });
  });

  it("a guard verdict settles; an infrastructure error retries", async () => {
    const { deps } = await setup();
    deps.checkout.mockRejectedValueOnce(new CheckoutError("contract_expired"));
    await evaluateMandate({ mandateId: "m1" }, deps);
    expect(deps.settle).toHaveBeenCalledWith("m1", "fired_blocked", {
      status: "error",
      code: "contract_expired",
    });

    deps.settle.mockClear();
    deps.checkout.mockRejectedValueOnce(
      new CheckoutError("checkout_storage_failed", 503),
    );
    await expect(evaluateMandate({ mandateId: "m1" }, deps)).rejects.toThrow(
      "checkout_storage_failed",
    );
    expect(deps.settle).not.toHaveBeenCalled();
  });

  it("only the signed trigger can fire", async () => {
    const { row, deps } = await setup();
    row.trigger = { type: "price_lte", sku: "U2727", amountMinor: 99_999 };
    await evaluateMandate({ mandateId: "m1" }, deps);
    expect(deps.observe).not.toHaveBeenCalled();
    expect(deps.settle).toHaveBeenCalledWith("m1", "fired_blocked", {
      status: "error",
      code: "mandate_mismatch",
    });
  });

  it("an unreadable signed body settles instead of retrying", async () => {
    const { deps } = await setup({ body: { mandate: {} } });
    await evaluateMandate({ mandateId: "m1" }, deps);
    expect(deps.observe).not.toHaveBeenCalled();
    expect(deps.settle).toHaveBeenCalledWith("m1", "fired_blocked", {
      status: "error",
      code: "mandate_mismatch",
    });
  });

  it("skips mandates that are not armed, lapsed, or unknown", async () => {
    const { row, deps } = await setup();
    expect(await evaluateMandate({}, deps)).toEqual({
      result: "skipped",
      reason: "malformed_message",
    });
    row.status = "cancelled";
    expect(await evaluateMandate({ mandateId: "m1" }, deps)).toEqual({
      result: "skipped",
      reason: "mandate_cancelled",
    });
    row.status = "armed";
    row.notAfter = "2026-09-27T11:59:59Z";
    expect(await evaluateMandate({ mandateId: "m1" }, deps)).toEqual({
      result: "skipped",
      reason: "mandate_lapsed",
    });
    deps.load.mockResolvedValue(null as never);
    expect(await evaluateMandate({ mandateId: "m1" }, deps)).toEqual({
      result: "skipped",
      reason: "mandate_not_found",
    });
    expect(deps.checkout).not.toHaveBeenCalled();
  });

  it("closes a mandate whose contract left armed some other way", async () => {
    const { deps } = await setup({ status: "invalidated" });
    await evaluateMandate({ mandateId: "m1" }, deps);
    expect(deps.observe).not.toHaveBeenCalled();
    expect(deps.settle).toHaveBeenCalledWith("m1", "cancelled", {
      status: "contract_invalidated",
    });
  });
});
