import { describe, expect, it } from "vitest";
import { errorMessages, totalAmount } from "./totals";
import {
  ACP_API_VERSION,
  AcpError,
  Address,
  CheckoutSession,
  CreateSessionRequest,
  UpdateSessionRequest,
} from "./types";

const address = {
  name: "Ada Lovelace",
  line_one: "1 Analytical Way",
  city: "Atlanta",
  state: "GA",
  country: "US",
  postal_code: "30332",
};

const SESSION = {
  id: "cs_1",
  status: "ready_for_payment" as const,
  currency: "usd",
  line_items: [
    {
      id: "li_1",
      item: { id: "vireo-u2727", quantity: 1 },
      base_amount: 32900,
      discount: 0,
      subtotal: 32900,
      tax: 2632,
      total: 35532,
    },
  ],
  fulfillment_options: [
    {
      type: "shipping" as const,
      id: "std",
      title: "Standard",
      subtotal: 0,
      tax: 0,
      total: 0,
    },
  ],
  totals: [
    {
      type: "items_base_amount" as const,
      display_text: "Items",
      amount: 32900,
    },
    { type: "subtotal" as const, display_text: "Subtotal", amount: 32900 },
    { type: "fulfillment" as const, display_text: "Shipping", amount: 0 },
    { type: "tax" as const, display_text: "Tax", amount: 2632 },
    { type: "fee" as const, display_text: "Fee", amount: 0 },
    { type: "total" as const, display_text: "Total", amount: 35532 },
  ],
  messages: [] as CheckoutSession["messages"],
  links: [] as CheckoutSession["links"],
};

describe("ACP types (API-Version 2025-09-12)", () => {
  it("pins the protocol version", () => {
    expect(ACP_API_VERSION).toBe("2025-09-12");
  });

  it("accepts a well-formed session and keeps unknown merchant fields", () => {
    const parsed = CheckoutSession.parse({
      ...SESSION,
      merchant_only: "kept",
    });
    expect(parsed.id).toBe("cs_1");
    expect(parsed).toMatchObject({ merchant_only: "kept" });
  });

  it("rejects a create body with no items or an extra field", () => {
    expect(CreateSessionRequest.safeParse({ items: [] }).success).toBe(false);
    expect(
      CreateSessionRequest.safeParse({
        items: [{ id: "sku", quantity: 1 }],
        surprise: true,
      }).success,
    ).toBe(false);
  });

  it("rejects an empty update and a non-ISO country", () => {
    expect(UpdateSessionRequest.safeParse({}).success).toBe(false);
    expect(Address.safeParse({ ...address, country: "usa" }).success).toBe(
      false,
    );
  });

  it("maps typed ACP errors and ignores unknown error fields", () => {
    const parsed = AcpError.parse({
      type: "invalid_request",
      code: "out_of_stock",
      message: "Vireo U2727 is gone",
      hint: "try Halden",
    });
    expect(parsed.code).toBe("out_of_stock");
    expect(parsed).toMatchObject({ hint: "try Halden" });
  });
});

describe("session totals", () => {
  it("reads a total line and collects error messages", () => {
    expect(totalAmount(SESSION, "total")).toBe(35532);
    expect(totalAmount(SESSION, "discount")).toBeNull();
    const errors = {
      ...SESSION,
      messages: [
        {
          type: "info" as const,
          content_type: "plain" as const,
          content: "ok",
        },
        {
          type: "error" as const,
          code: "out_of_stock" as const,
          content_type: "plain" as const,
          content: "gone",
        },
      ],
    };
    expect(errorMessages(errors).map((m) => m.code)).toEqual(["out_of_stock"]);
  });
});
