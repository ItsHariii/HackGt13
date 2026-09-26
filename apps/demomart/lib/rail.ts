import "server-only";
import {
  type MerchantRail,
  SimulatedRail,
  VisaAcceptanceRail,
} from "@proofcart/payments";
import { isConfigured } from "@proofcart/platform/env";

function visaConfig() {
  const e = process.env;
  const values = {
    runEnvironment: e.VISA_ACCEPTANCE_RUN_ENV,
    merchantId: e.VISA_ACCEPTANCE_MERCHANT_ID,
    keyId: e.VISA_ACCEPTANCE_KEY_ID,
    secretKey: e.VISA_ACCEPTANCE_SECRET_KEY,
  };
  return Object.values(values).every(isConfigured)
    ? (values as Record<keyof typeof values, string>)
    : null;
}

let rail: MerchantRail | null = null;

/**
 * PAYMENT_RAIL picks the rail explicitly. Unset, DemoMart uses Visa Acceptance
 * when its credentials are present and the labeled simulated rail otherwise.
 * Asking for Visa without credentials is a configuration error, not a fallback.
 */
export function merchantRail(): MerchantRail {
  if (rail) return rail;
  const wanted = process.env.PAYMENT_RAIL;
  const visa = visaConfig();
  if (wanted === "simulated" || (!wanted && !visa)) {
    rail = new SimulatedRail();
  } else if (wanted === "visa_acceptance" || !wanted) {
    if (!visa)
      throw new Error(
        "PAYMENT_RAIL=visa_acceptance but VISA_ACCEPTANCE_* is not configured",
      );
    rail = new VisaAcceptanceRail(visa);
  } else {
    throw new Error(`DemoMart does not support PAYMENT_RAIL=${wanted}`);
  }
  return rail;
}
