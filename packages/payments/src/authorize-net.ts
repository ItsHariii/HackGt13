import { z } from "zod";
import {
  type ChargeOutcome,
  type ChargeRequest,
  type MerchantRail,
  RAIL_LABELS,
} from "./charge";
import type { InstrumentRef } from "./enrollment";
import { formatMinor } from "./visa-acceptance";

export interface AuthorizeNetConfig {
  apiLoginId: string;
  transactionKey: string;
  fetch?: typeof fetch;
}
/** Sandbox only. Accept.js nonces are exchanged for a reusable CIM profile. */
export class AuthorizeNetRail implements MerchantRail {
  readonly id = "authorize_net" as const;
  readonly label = RAIL_LABELS.authorize_net;
  constructor(private readonly config: AuthorizeNetConfig) {}
  private async call(name: string, input: object) {
    const response = await (this.config.fetch ?? fetch)(
      "https://apitest.authorize.net/xml/v1/request.api",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        redirect: "error",
        body: JSON.stringify({
          [name]: {
            merchantAuthentication: {
              name: this.config.apiLoginId,
              transactionKey: this.config.transactionKey,
            },
            ...input,
          },
        }),
        signal: AbortSignal.timeout(20000),
        cache: "no-store",
      },
    );
    if (!response.ok) throw new Error("authorize_net_unavailable");
    return JSON.parse((await response.text()).replace(/^\uFEFF/, ""));
  }
  async enroll(
    opaqueData: { dataDescriptor: string; dataValue: string },
    userId: string,
  ): Promise<InstrumentRef> {
    const result = await this.call("createCustomerProfileRequest", {
      profile: {
        merchantCustomerId: userId.replaceAll("-", "").slice(0, 20),
        paymentProfiles: [{ payment: { opaqueData } }],
      },
      validationMode: "testMode",
    });
    const customer = z.string().regex(/^\d+$/).parse(result.customerProfileId);
    const payment = z
      .string()
      .regex(/^\d+$/)
      .parse(result.customerPaymentProfileIdList?.[0]);
    const detail = await this.call("getCustomerPaymentProfileRequest", {
      customerProfileId: customer,
      customerPaymentProfileId: payment,
      unmaskExpirationDate: true,
    });
    const card = detail.paymentProfile?.payment?.creditCard;
    const expiry = /^(\d{4})-(\d{2})$/.exec(card?.expirationDate ?? "");
    const last4 = String(card?.cardNumber ?? "").slice(-4);
    return {
      railRef: `anet:${customer}:${payment}`,
      brand: card?.cardType ?? null,
      last4: /^\d{4}$/.test(last4) ? last4 : null,
      expMonth: expiry ? Number(expiry[2]) : null,
      expYear: expiry ? Number(expiry[1]) : null,
    };
  }
  async charge(req: ChargeRequest): Promise<ChargeOutcome> {
    const base = {
      rail: this.id,
      railLabel: this.label,
      transactionId: null,
      reconciliationId: null,
      approvalCode: null,
      requires3ds: false,
      reason: null,
      message: null,
    };
    const match = /^anet:(\d+):(\d+)$/.exec(req.instrumentRef);
    if (!match || req.currency !== "USD")
      return { ...base, status: "error", railStatus: "INVALID_REQUEST" };
    try {
      const raw = await this.call("createTransactionRequest", {
        transactionRequest: {
          transactionType: "authCaptureTransaction",
          amount: formatMinor(req.amountMinor),
          profile: {
            customerProfileId: match[1],
            paymentProfile: { paymentProfileId: match[2] },
          },
          order: { invoiceNumber: req.reference.slice(0, 20) },
          userFields: {
            userField: req.merchantDefined.map((value, i) => ({
              name: `cartel_${i + 1}`,
              value,
            })),
          },
        },
      });
      const txn = raw.transactionResponse;
      return {
        ...base,
        status:
          txn?.responseCode === "1"
            ? "approved"
            : txn?.responseCode === "4"
              ? "pending_review"
              : txn?.responseCode === "2"
                ? "declined"
                : "error",
        railStatus: String(txn?.responseCode ?? "ERROR"),
        transactionId: txn?.transId && txn.transId !== "0" ? txn.transId : null,
        approvalCode: txn?.authCode ?? null,
        reason: txn?.errors?.[0]?.errorCode ?? null,
      };
    } catch {
      return {
        ...base,
        status: "error",
        railStatus: "UNKNOWN",
        message: "Payment outcome unknown. Reconcile before retrying.",
      };
    }
  }
}
