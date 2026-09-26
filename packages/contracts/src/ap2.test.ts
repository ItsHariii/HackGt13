import { describe, expect, it } from "vitest";
import { type Ap2UserAuthorization, toAp2, toMajor } from "./ap2";
import type { ContractBody } from "./contract";
import { FLAGSHIP_CONTRACT_V8, FLAGSHIP_V8_SIGNATURE } from "./fixtures";

function decode(b64url: string): Ap2UserAuthorization {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

describe("toAp2", () => {
  const out = toAp2(FLAGSHIP_CONTRACT_V8, FLAGSHIP_V8_SIGNATURE);

  it("matches the snapshot for contract v8", () => {
    expect(out).toMatchSnapshot();
  });

  it("maps the SDD §12.4 fields", () => {
    expect(out.intentMandate.natural_language_description).toBe(
      FLAGSHIP_CONTRACT_V8.intent.text,
    );
    expect(out.intentMandate.merchants).toEqual(["greathub"]);
    expect(out.intentMandate.skus).toContain("M27Q-USBC");
    expect(out.intentMandate.user_cart_confirmation_required).toBe(true);
    expect(out.intentMandate.intent_expiry).toBe(
      FLAGSHIP_CONTRACT_V8.expiresAt,
    );
    expect(out.cartMandate.contents.id).toBe("c_flagship@8");
    expect(out.cartMandate.contents.cart_expiry).toBe(
      FLAGSHIP_CONTRACT_V8.expiresAt,
    );
    expect(out.cartMandate.contents.merchant_name).toBe("greathub");
    expect(out.cartMandate.merchant_authorization).toBeNull();
  });

  it("totals $870.37 and the display items add up to it", () => {
    const { details } = out.cartMandate.contents.payment_request;
    expect(details.total.amount).toEqual({ currency: "USD", value: 870.37 });
    const cents = details.display_items.reduce(
      (sum, i) => sum + Math.round(i.amount.value * 100),
      0,
    );
    expect(cents).toBe(87_037);
    expect(
      details.display_items.find((i) => i.label === "Estimated tax")?.pending,
    ).toBe(true);
  });

  it("encodes the user's WebAuthn authorization with the body hash", () => {
    const auth = decode(out.user_authorization);
    expect(auth.type).toBe("webauthn.get");
    expect(auth.bodyHash).toBe(FLAGSHIP_V8_SIGNATURE.bodyHash);
    expect(auth.signature).toBe(FLAGSHIP_V8_SIGNATURE.signature);
  });

  it("uses the mandate for expiry and skips cart confirmation when armed", () => {
    const armed: ContractBody = {
      ...FLAGSHIP_CONTRACT_V8,
      mandate: {
        trigger: { type: "price_lte", sku: "U2727", amountMinor: 32_000 },
        notAfter: "2026-09-26T14:15:00Z",
      },
    };
    const a = toAp2(armed, FLAGSHIP_V8_SIGNATURE);
    expect(a.intentMandate.intent_expiry).toBe("2026-09-26T14:15:00Z");
    expect(a.intentMandate.user_cart_confirmation_required).toBe(false);
  });

  it("requires refundability only for a hard final-sale/returnable rule", () => {
    expect(out.intentMandate.requires_refundability).toBe(false);
    const withReturnable: ContractBody = {
      ...FLAGSHIP_CONTRACT_V8,
      requirements: [
        ...FLAGSHIP_CONTRACT_V8.requirements,
        {
          id: "r_returnable",
          scope: "item",
          role: "monitor",
          field: "offer.final_sale",
          op: "eq",
          target: false,
          importance: "hard",
          evidence: { minStateToPass: "verified" },
          materiality: "always",
          provenance: {
            kind: "user_selected",
            via: "form",
            label: "Must be returnable",
          },
        },
      ],
    };
    expect(
      toAp2(withReturnable, FLAGSHIP_V8_SIGNATURE).intentMandate
        .requires_refundability,
    ).toBe(true);
  });
});

describe("toMajor", () => {
  it("respects ISO 4217 exponents", () => {
    expect(toMajor(87_037, "USD")).toBe(870.37);
    expect(toMajor(1_000, "JPY")).toBe(1000);
    expect(toMajor(1_234, "KWD")).toBe(1.234);
    expect(toMajor(10, "USD")).toBe(0.1);
  });
});
