import { contractHash } from "@cartel/contracts";
import { FLAGSHIP_CONTRACT_V8 } from "@cartel/contracts/fixtures";
import {
  generateEd25519Jwk,
  importPublicJwk,
  signingKeyFromEnv,
} from "@cartel/tap";
import { describe, expect, it, vi } from "vitest";
import { AuthorizeNetRail } from "./authorize-net";
import { EnrollInput, VisaEnrollment } from "./enrollment";
import { verifyGrant } from "./grant";
import { ShopifyHandoffClient } from "./handoff";
import { GuardedPaymentRail, VicRail } from "./rail";
import { signWebhook, verifyWebhook } from "./webhook";

const config = {
  runEnvironment: "apitest.cybersource.com",
  merchantId: "merchant",
  keyId: "key",
  secretKey: Buffer.from("sandbox-secret").toString("base64"),
};
const billTo = {
  firstName: "Test",
  lastName: "Buyer",
  address1: "1 Test St",
  locality: "Atlanta",
  administrativeArea: "GA",
  postalCode: "30332",
  country: "US",
  email: "test@example.com",
};
describe("tokenized enrollment", () => {
  it("rejects raw PAN, CVV and unknown fields at the request boundary", () => {
    expect(
      EnrollInput.safeParse({
        rail: "visa_acceptance",
        transientToken: "x".repeat(50),
        billTo,
        cardNumber: "4111111111111111",
        cvv: "123",
      }).success,
    ).toBe(false);
  });
  it.each(["001", "visa"])(
    "uses zero-value authorization/token creation and saves only masked metadata (%s)",
    async (cardType) => {
      const calls: { url: string; body: unknown }[] = [];
      const fetchMock = vi.fn(async (url, init) => {
        calls.push({
          url: String(url),
          body: init?.body ? JSON.parse(String(init.body)) : null,
        });
        return Response.json(
          calls.length === 1
            ? {
                status: "AUTHORIZED",
                tokenInformation: {
                  customer: { id: "customer" },
                  paymentInstrument: { id: "pi123" },
                },
              }
            : {
                card: {
                  type: cardType,
                  expirationMonth: "12",
                  expirationYear: "2031",
                },
                _embedded: {
                  instrumentIdentifier: {
                    card: { number: "XXXXXXXXXXXX1111" },
                  },
                },
              },
        );
      }) as unknown as typeof fetch;
      const ref = await new VisaEnrollment({
        ...config,
        fetch: fetchMock,
      }).enroll("transient", billTo, "user");
      expect(calls[0]?.body).toMatchObject({
        processingInformation: {
          capture: false,
          actionList: ["TOKEN_CREATE"],
          actionTokenTypes: ["customer", "paymentInstrument"],
        },
        tokenInformation: { transientTokenJwt: "transient" },
        orderInformation: { amountDetails: { totalAmount: "0.00" } },
      });
      expect(calls[1]?.url?.endsWith("/tms/v1/paymentinstruments/pi123")).toBe(
        true,
      );
      expect(ref).toEqual({
        railRef: "tms:pi123",
        brand: "Visa",
        last4: "1111",
        expMonth: 12,
        expYear: 2031,
      });
      expect(JSON.stringify(ref)).not.toContain("transient");
    },
  );
  it("does not accept a provider decline as successful enrollment", async () => {
    const client = new VisaEnrollment({
      ...config,
      fetch: async () => Response.json({ status: "DECLINED" }),
    });
    await expect(client.enroll("transient", billTo, "user")).rejects.toThrow(
      "enrollment_failed",
    );
  });
  it("Authorize.net uses Accept.js opaqueData and CIM references", async () => {
    const bodies: unknown[] = [];
    const rail = new AuthorizeNetRail({
      apiLoginId: "login",
      transactionKey: "secret",
      fetch: async (_url, init) => {
        bodies.push(JSON.parse(String(init?.body)));
        return Response.json(
          bodies.length === 1
            ? {
                customerProfileId: "123",
                customerPaymentProfileIdList: ["456"],
              }
            : {
                paymentProfile: {
                  payment: {
                    creditCard: {
                      cardNumber: "XXXX1111",
                      expirationDate: "2031-12",
                      cardType: "Visa",
                    },
                  },
                },
              },
        );
      },
    });
    expect(
      await rail.enroll(
        { dataDescriptor: "COMMON.ACCEPT.INAPP.PAYMENT", dataValue: "nonce" },
        "user",
      ),
    ).toMatchObject({ railRef: "anet:123:456", last4: "1111" });
    expect(bodies[0]).toMatchObject({
      createCustomerProfileRequest: {
        profile: {
          paymentProfiles: [
            { payment: { opaqueData: { dataValue: "nonce" } } },
          ],
        },
      },
    });
  });
});
describe("guard-scoped credentials", () => {
  it("consumes the execution token and issues only one credential bound to its exact amount", async () => {
    const jwk = await generateEd25519Jwk("ct-grant-test");
    const key = await signingKeyFromEnv(JSON.stringify(jwk.privateJwk));
    const contract = FLAGSHIP_CONTRACT_V8;
    const id = crypto.randomUUID();
    const consume = vi.fn(async () => ({
      id,
      rail: "simulated" as const,
      bodyHash: await contractHash(contract),
      amountMinor: 100,
      currency: "USD",
      instrumentRef: "simulated:test",
    }));
    const rail = new GuardedPaymentRail({
      id: "simulated",
      issuer: "https://cartel.example",
      key,
      consume,
    });
    const prepared = await rail.prepare(id, contract);
    const credential = await rail.credentialFor(prepared);
    const verified = await verifyGrant(credential.token, {
      resolveKey: async () => importPublicJwk(jwk.publicJwk),
      audience: contract.merchants[0]?.origin ?? "",
      merchantId: contract.merchants[0]?.id ?? "",
      amountMinor: 101,
      currency: "USD",
    });
    expect(verified).toMatchObject({
      ok: false,
      reason: "amount_exceeds_grant",
    });
    for (const amountMinor of [99, 100]) {
      const quote = await verifyGrant(credential.token, {
        resolveKey: async () => importPublicJwk(jwk.publicJwk),
        audience: contract.merchants[0]?.origin ?? "",
        merchantId: contract.merchants[0]?.id ?? "",
        amountMinor,
        currency: "USD",
      });
      expect(quote).toMatchObject(
        amountMinor === 100
          ? { ok: true }
          : { ok: false, reason: "quote_changed" },
      );
    }
    await expect(rail.credentialFor(prepared)).rejects.toThrow(
      "execution_token_consumed",
    );
    expect(consume).toHaveBeenCalledOnce();
    await expect(rail.credentialFor({ ...prepared })).rejects.toThrow(
      "execution_token_consumed",
    );
  });
  it("VIC fails closed without credentials", async () => {
    await expect(new VicRail().prepare()).rejects.toThrow(
      "vic_credentials_required",
    );
  });
});
describe("webhook authentication", () => {
  it("checks raw bytes, secret, stale/future timestamps and boundary tolerance", async () => {
    const body = '{"event_id":"event-1"}';
    const signature = await signWebhook("secret", body, 1000);
    expect(await verifyWebhook("secret", body, signature, 1300)).toBe(true);
    expect(await verifyWebhook("secret", body, signature, 1301)).toBe(false);
    expect(await verifyWebhook("secret", body, signature, 699)).toBe(false);
    expect(await verifyWebhook("other", body, signature, 1000)).toBe(false);
    expect(await verifyWebhook("secret", `${body} `, signature, 1000)).toBe(
      false,
    );
  });
});
describe("Shopify hand-off transport", () => {
  it("creates a cart and checkout, re-reads and returns only an allowed store URL", async () => {
    const names: string[] = [];
    const checkout = {
      id: "checkout",
      currency: "USD",
      status: "requires_escalation",
      continue_url: "https://shop.example/checkout/1",
      line_items: [],
      totals: [],
    };
    const client = new ShopifyHandoffClient({
      origin: "https://shop.example",
      agentProfile: "https://cartel.example/ucp",
      accessToken: "token",
      fetch: async (_url, init) => {
        if (!init?.body)
          return Response.json({
            ucp: {
              services: {
                "dev.ucp.shopping": [
                  { transport: "mcp", endpoint: "https://shop.example/mcp" },
                ],
              },
            },
          });
        const name = JSON.parse(String(init.body)).params.name;
        names.push(name);
        return Response.json({
          result: {
            structuredContent:
              name === "create_cart" ? { cart: { id: "cart" } } : checkout,
          },
        });
      },
    });
    expect(
      (await client.create([{ sku: "variant", qty: 1 }])).continue_url,
    ).toBe(checkout.continue_url);
    expect(names).toEqual(["create_cart", "create_checkout", "get_checkout"]);
    checkout.continue_url = "https://evil.example/pay";
    await expect(client.create([{ sku: "variant", qty: 1 }])).rejects.toThrow(
      "ucp_redirect_rejected",
    );
  });
});
