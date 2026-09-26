// T13.1 sandbox smoke test. Opt-in because it calls the real Visa Acceptance
// sandbox: VISA_ACCEPTANCE_SMOKE=1 with the VISA_ACCEPTANCE_* variables set.
import { describe, expect, it } from "vitest";
import { VisaAcceptanceRail } from "./charge";

const env = process.env;
const enabled =
  env.VISA_ACCEPTANCE_SMOKE === "1" &&
  env.VISA_ACCEPTANCE_RUN_ENV === "apitest.cybersource.com" &&
  !!env.VISA_ACCEPTANCE_MERCHANT_ID &&
  !!env.VISA_ACCEPTANCE_KEY_ID &&
  !!env.VISA_ACCEPTANCE_SECRET_KEY;

describe.skipIf(!enabled)("Visa Acceptance sandbox", () => {
  it("authorizes the test card for $1.00", async () => {
    const rail = new VisaAcceptanceRail({
      runEnvironment: env.VISA_ACCEPTANCE_RUN_ENV as string,
      merchantId: env.VISA_ACCEPTANCE_MERCHANT_ID as string,
      keyId: env.VISA_ACCEPTANCE_KEY_ID as string,
      secretKey: env.VISA_ACCEPTANCE_SECRET_KEY as string,
    });
    const outcome = await rail.charge({
      reference: "smoke@1",
      amountMinor: 100,
      currency: "USD",
      instrumentRef: "sandbox:visa-test-card",
      billTo: {
        firstName: "Test",
        lastName: "Shopper",
        address1: "1 Test Merchant Way",
        locality: "Atlanta",
        administrativeArea: "GA",
        postalCode: "30332",
        country: "US",
        email: "test@example.com",
      },
      merchantDefined: ["smoke", "no-contract", "no-grant"],
    });
    console.info(
      `Visa Acceptance sandbox transaction ${outcome.transactionId} → ${outcome.railStatus}`,
    );
    expect(outcome.status).toBe("approved");
    expect(outcome.transactionId).toMatch(/^\d+$/);
  }, 30_000);
});
