// Merchant-side charging (SDD §13.4): what GreatHub calls once the agent
// signature, the grant and the contract all check out.

import {
  type BillTo,
  type PaymentResponse,
  type PaymentSource,
  VisaAcceptanceClient,
  type VisaAcceptanceConfig,
} from "./visa-acceptance";

export type RailId = "visa_acceptance" | "simulated" | "authorize_net" | "vic";

export const RAIL_LABELS: Record<RailId, string> = {
  authorize_net: "Authorize.net sandbox",
  vic: "Visa Intelligent Commerce unavailable: credentials required",
  visa_acceptance:
    "Visa Acceptance sandbox. The scoped grant emulates agent-token controls at the application layer.",
  simulated: "Simulated payment. No network call.",
};

export interface ChargeRequest {
  reference: string;
  amountMinor: number;
  currency: string;
  /** From the grant: `tms:<paymentInstrumentId>`, `sandbox:visa-test-card`, `simulated:*`. */
  instrumentRef: string;
  billTo: BillTo;
  merchantDefined: string[];
}

export type ChargeStatus = "approved" | "pending_review" | "declined" | "error";

export interface ChargeOutcome {
  status: ChargeStatus;
  rail: RailId;
  railLabel: string;
  transactionId: string | null;
  reconciliationId: string | null;
  approvalCode: string | null;
  /** The rail's own status string, e.g. AUTHORIZED or DECLINED. */
  railStatus: string;
  reason: string | null;
  message: string | null;
  requires3ds: boolean;
}

export interface MerchantRail {
  id: RailId;
  label: string;
  charge(req: ChargeRequest): Promise<ChargeOutcome>;
}

/** Public Visa test PAN; accepted only by the sandbox client. */
const SANDBOX_TEST_CARD: PaymentSource = {
  kind: "sandbox_test_card",
  number: "4111111111111111",
  expirationMonth: "12",
  expirationYear: "2031",
};

export function paymentSourceFor(
  instrumentRef: string,
  sandbox: boolean,
): PaymentSource | null {
  const tms = /^tms:([A-Za-z0-9]{1,64})$/.exec(instrumentRef);
  if (tms?.[1]) return { kind: "tms_instrument", instrumentId: tms[1] };
  if (instrumentRef === "sandbox:visa-test-card" && sandbox)
    return SANDBOX_TEST_CARD;
  return null;
}

export function classifyVisa(
  res: PaymentResponse,
): Pick<ChargeOutcome, "status" | "requires3ds"> {
  switch (res.status) {
    case "AUTHORIZED":
      return { status: "approved", requires3ds: false };
    case "AUTHORIZED_PENDING_REVIEW":
    case "PENDING_REVIEW":
      return { status: "pending_review", requires3ds: false };
    case "PENDING_AUTHENTICATION":
      return { status: "declined", requires3ds: true };
    case "DECLINED":
    case "AUTHORIZED_RISK_DECLINED":
    case "PARTIAL_AUTHORIZED":
      return { status: "declined", requires3ds: false };
    default:
      return { status: "error", requires3ds: false };
  }
}

export class VisaAcceptanceRail implements MerchantRail {
  readonly id = "visa_acceptance" as const;
  readonly label = RAIL_LABELS.visa_acceptance;
  private readonly client: VisaAcceptanceClient;

  constructor(config: VisaAcceptanceConfig) {
    this.client = new VisaAcceptanceClient(config);
  }

  async charge(req: ChargeRequest): Promise<ChargeOutcome> {
    const source = paymentSourceFor(req.instrumentRef, this.client.sandbox);
    if (!source) {
      return {
        ...this.base(),
        status: "error",
        railStatus: "INVALID_REQUEST",
        reason: "UNSUPPORTED_INSTRUMENT",
        message: "The grant's instrument reference is not usable on this rail.",
      };
    }
    let res: PaymentResponse;
    try {
      res = await this.client.createPayment({
        reference: req.reference,
        amountMinor: req.amountMinor,
        currency: req.currency,
        source,
        billTo: req.billTo,
        capture: true,
        merchantDefined: req.merchantDefined,
      });
    } catch (e) {
      const timeout = (e as Error).name === "TimeoutError";
      return {
        ...this.base(),
        status: "error",
        railStatus: timeout ? "TIMEOUT" : "NETWORK_ERROR",
        reason: timeout ? "TIMEOUT" : "NETWORK_ERROR",
        message: timeout
          ? "No response from Visa Acceptance. The payment may still have gone through; reconcile before retrying."
          : "Could not reach Visa Acceptance.",
      };
    }
    return {
      ...this.base(),
      ...classifyVisa(res),
      transactionId: res.id,
      reconciliationId: res.reconciliationId,
      approvalCode: res.approvalCode,
      railStatus: res.status,
      reason: res.reason,
      message: res.message,
    };
  }

  private base(): ChargeOutcome {
    return {
      status: "error",
      rail: this.id,
      railLabel: this.label,
      transactionId: null,
      reconciliationId: null,
      approvalCode: null,
      railStatus: "",
      reason: null,
      message: null,
      requires3ds: false,
    };
  }
}

/** Last resort (SDD §13.4). Always labeled; `simulated:decline` declines. */
export class SimulatedRail implements MerchantRail {
  readonly id = "simulated" as const;
  readonly label = RAIL_LABELS.simulated;

  async charge(req: ChargeRequest): Promise<ChargeOutcome> {
    const declined = req.instrumentRef === "simulated:decline";
    return {
      status: declined ? "declined" : "approved",
      rail: this.id,
      railLabel: this.label,
      transactionId: declined
        ? null
        : `sim_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`,
      reconciliationId: null,
      approvalCode: declined ? null : "SIM000",
      railStatus: declined ? "DECLINED" : "AUTHORIZED",
      reason: declined ? "SIMULATED_DECLINE" : null,
      message: declined ? "Simulated decline." : null,
      requires3ds: false,
    };
  }
}
