import type { ContractBody, ContractSignature } from "./contract";
import { effectiveImportance } from "./requirement";

/*
 * AP2-shaped export (SDD §12.4). Field names follow the AP2 Python SDK
 * models (`ap2.models.mandate`, `ap2.models.payment_request`), checked
 * 2026-09-26. AP2 carries `user_authorization` on its PaymentMandate; Cartel
 * does not issue payment mandates, so the export returns the user's
 * authorization next to the cart mandate instead.
 */

export type Ap2Amount = { currency: string; value: number };
export type Ap2PaymentItem = {
  label: string;
  amount: Ap2Amount;
  pending?: boolean;
  refund_period: number;
};

export type Ap2IntentMandate = {
  user_cart_confirmation_required: boolean;
  natural_language_description: string;
  merchants: string[];
  skus: string[];
  requires_refundability: boolean;
  intent_expiry: string;
};

export type Ap2CartMandate = {
  contents: {
    id: string;
    user_cart_confirmation_required: boolean;
    payment_request: {
      method_data: {
        supported_methods: string;
        data: Record<string, unknown>;
      }[];
      details: {
        id: string;
        display_items: Ap2PaymentItem[];
        total: Ap2PaymentItem;
      };
    };
    cart_expiry: string;
    merchant_name: string;
  };
  /** Only the merchant can sign cart contents; Cartel leaves this empty. */
  merchant_authorization: null;
};

/** Decoded form of `user_authorization`. */
export type Ap2UserAuthorization = {
  type: "webauthn.get";
  bodyHash: string;
  credentialId: string;
  authenticatorData: string;
  clientDataJSON: string;
  signature: string;
};

export type Ap2Export = {
  intentMandate: Ap2IntentMandate;
  cartMandate: Ap2CartMandate;
  /** base64url(JSON(Ap2UserAuthorization)). */
  user_authorization: string;
};

/** ISO 4217 minor-unit exponents that differ from 2. */
const CURRENCY_EXPONENT: Record<string, number> = {
  BHD: 3,
  CLP: 0,
  ISK: 0,
  JOD: 3,
  JPY: 0,
  KRW: 0,
  KWD: 3,
  OMR: 3,
  TND: 3,
  UGX: 0,
  VND: 0,
};

/** Minor units to the decimal major-unit number W3C Payment Request expects. */
export function toMajor(amountMinor: number, currency: string): number {
  const exponent = CURRENCY_EXPONENT[currency] ?? 2;
  return Number((amountMinor / 10 ** exponent).toFixed(exponent));
}

/** A hard `final_sale == false` or `returnable == true` requirement. */
function requiresRefundability(contract: ContractBody): boolean {
  return contract.requirements.some((r) => {
    if (effectiveImportance(r) !== "hard") return false;
    if (r.field.endsWith(".final_sale")) {
      return (
        (r.op === "eq" && r.target === false) ||
        (r.op === "neq" && r.target === true)
      );
    }
    return (
      r.field.endsWith(".returnable") && r.op === "eq" && r.target === true
    );
  });
}

function base64UrlJson(value: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Produces AP2 Intent and Cart mandates from a signed contract. The
 * signature must be over this exact body; the caller verifies it first.
 */
export function toAp2(
  contract: ContractBody,
  signature: ContractSignature,
): Ap2Export {
  const { currency } = contract.economics;
  const amount = (minor: number): Ap2Amount => ({
    currency,
    value: toMajor(minor, currency),
  });
  const id = `${contract.contractId}@${contract.version}`;
  const oneTime = contract.mandate === null;
  const e = contract.economics;

  const displayItems: Ap2PaymentItem[] = contract.items.map((item) => ({
    label: item.qty === 1 ? item.title : `${item.title} × ${item.qty}`,
    amount: amount(item.unitPriceMinor * item.qty),
    refund_period: item.terms.finalSale ? 0 : item.terms.returnWindowDays,
  }));
  displayItems.push(
    { label: "Shipping", amount: amount(e.shippingMinor), refund_period: 0 },
    {
      label: "Estimated tax",
      amount: amount(e.taxEstimateMinor),
      pending: true,
      refund_period: 0,
    },
  );

  const merchantIds = contract.merchants.map((m) => m.id);
  const authorization: Ap2UserAuthorization = {
    type: "webauthn.get",
    bodyHash: signature.bodyHash,
    credentialId: signature.credentialId,
    authenticatorData: signature.authenticatorData,
    clientDataJSON: signature.clientDataJSON,
    signature: signature.signature,
  };

  return {
    intentMandate: {
      user_cart_confirmation_required: oneTime,
      natural_language_description: contract.intent.text,
      merchants: merchantIds,
      skus: contract.items.map((i) => i.sku),
      requires_refundability: requiresRefundability(contract),
      intent_expiry: contract.mandate?.notAfter ?? contract.expiresAt,
    },
    cartMandate: {
      contents: {
        id,
        user_cart_confirmation_required: oneTime,
        payment_request: {
          method_data: [
            { supported_methods: "CARD", data: { network: ["visa"] } },
          ],
          details: {
            id,
            display_items: displayItems,
            total: {
              label: "Total",
              amount: amount(
                e.merchandiseMinor + e.shippingMinor + e.taxEstimateMinor,
              ),
              refund_period: 0,
            },
          },
        },
        cart_expiry: contract.expiresAt,
        merchant_name: merchantIds[0] ?? "",
      },
      merchant_authorization: null,
    },
    user_authorization: base64UrlJson(authorization),
  };
}
