import { createHash, createHmac } from "node:crypto";
import {
  generateEd25519Jwk,
  importPrivateJwk,
  importPublicJwk,
} from "@proofcart/tap";
import { describe, expect, it } from "vitest";
import { classifyVisa, paymentSourceFor, SimulatedRail } from "./charge";
import { mintGrant, verifyGrant } from "./grant";
import { formatMinor, paymentBody, signedHeaders } from "./visa-acceptance";

const config = {
  runEnvironment: "apitest.cybersource.com",
  merchantId: "test_merchant",
  keyId: "00000000-0000-0000-0000-000000000000",
  secretKey: Buffer.from("not-a-real-secret-0123456789abcdef").toString(
    "base64",
  ),
};

describe("Visa Acceptance HTTP signature", () => {
  it("signs host, date, request-target, digest and merchant ID", async () => {
    const body = '{"a":1}';
    const date = new Date("2026-09-26T14:03:00Z");
    const headers = await signedHeaders(
      config,
      "POST",
      "/pts/v2/payments",
      body,
      date,
    );
    const digest = `SHA-256=${createHash("sha256").update(body).digest("base64")}`;
    const signingString = [
      "host: apitest.cybersource.com",
      "date: Sat, 26 Sep 2026 14:03:00 GMT",
      "request-target: post /pts/v2/payments",
      `digest: ${digest}`,
      "v-c-merchant-id: test_merchant",
    ].join("\n");
    const mac = createHmac("sha256", Buffer.from(config.secretKey, "base64"))
      .update(signingString)
      .digest("base64");
    expect(headers).toEqual({
      "v-c-merchant-id": "test_merchant",
      date: "Sat, 26 Sep 2026 14:03:00 GMT",
      host: "apitest.cybersource.com",
      digest,
      signature: `keyid="${config.keyId}", algorithm="HmacSHA256", headers="host date request-target digest v-c-merchant-id", signature="${mac}"`,
    });
  });

  it("omits the digest for GET", async () => {
    const headers = await signedHeaders(
      config,
      "GET",
      "/pts/v2/payments/1",
      undefined,
    );
    expect(headers.digest).toBeUndefined();
    expect(headers.signature).toContain(
      'headers="host date request-target v-c-merchant-id"',
    );
  });
});

describe("payment body", () => {
  const billTo = {
    firstName: "Ada",
    lastName: "Lovelace",
    address1: "1 Main St",
    locality: "Atlanta",
    administrativeArea: "GA",
    postalCode: "30332",
    country: "US",
    email: "ada@example.com",
  };
  it("links the contract through reference and merchant-defined data", () => {
    const body = paymentBody({
      reference: "c_7f2@8",
      amountMinor: 87037,
      currency: "USD",
      source: { kind: "tms_instrument", instrumentId: "ABC123" },
      billTo,
      capture: true,
      merchantDefined: ["c_7f2", `sha256:${"a".repeat(64)}`, "grant_1"],
    });
    expect(body).toMatchObject({
      clientReferenceInformation: { code: "c_7f2@8" },
      processingInformation: { capture: true },
      paymentInformation: { paymentInstrument: { id: "ABC123" } },
      orderInformation: {
        amountDetails: { totalAmount: "870.37", currency: "USD" },
      },
      merchantDefinedInformation: [
        { key: "1", value: "c_7f2" },
        { key: "2", value: `sha256:${"a".repeat(64)}` },
        { key: "3", value: "grant_1" },
      ],
    });
  });
  it("formats minor units exactly", () => {
    expect(formatMinor(0)).toBe("0.00");
    expect(formatMinor(5)).toBe("0.05");
    expect(formatMinor(89605)).toBe("896.05");
    expect(() => formatMinor(1.5)).toThrow(RangeError);
  });
});

describe("rails", () => {
  it("resolves instruments; raw test cards only in the sandbox", () => {
    expect(paymentSourceFor("tms:7A1B2C", true)).toEqual({
      kind: "tms_instrument",
      instrumentId: "7A1B2C",
    });
    expect(paymentSourceFor("sandbox:visa-test-card", true)?.kind).toBe(
      "sandbox_test_card",
    );
    expect(paymentSourceFor("sandbox:visa-test-card", false)).toBeNull();
    expect(paymentSourceFor("4111111111111111", true)).toBeNull();
  });
  it("maps Visa statuses", () => {
    const res = (status: string) => ({
      httpStatus: 201,
      status,
      id: null,
      reconciliationId: null,
      approvalCode: null,
      reason: null,
      message: null,
      submitTimeUtc: null,
    });
    expect(classifyVisa(res("AUTHORIZED")).status).toBe("approved");
    expect(classifyVisa(res("AUTHORIZED_PENDING_REVIEW")).status).toBe(
      "pending_review",
    );
    expect(classifyVisa(res("DECLINED")).status).toBe("declined");
    expect(classifyVisa(res("PENDING_AUTHENTICATION"))).toEqual({
      status: "declined",
      requires3ds: true,
    });
    expect(classifyVisa(res("INVALID_REQUEST")).status).toBe("error");
  });
  it("labels simulated payments and can decline", async () => {
    const rail = new SimulatedRail();
    const req = {
      reference: "r",
      amountMinor: 100,
      currency: "USD",
      billTo: {} as never,
      merchantDefined: [],
    };
    expect(
      await rail.charge({ ...req, instrumentRef: "simulated:ok" }),
    ).toMatchObject({
      status: "approved",
      railLabel: "Simulated payment. No network call.",
    });
    expect(
      (await rail.charge({ ...req, instrumentRef: "simulated:decline" }))
        .status,
    ).toBe("declined");
  });
});

describe("scoped payment grant", async () => {
  const { privateJwk, publicJwk } = await generateEd25519Jwk("pc-grant-test");
  const key = {
    keyId: "pc-grant-test",
    privateKey: await importPrivateJwk(privateJwk),
  };
  const pub = await importPublicJwk(publicJwk);
  const resolveKey = async (kid: string) =>
    kid === "pc-grant-test" ? pub : null;
  const now = 1_790_000_000;
  const hash = `sha256:${"b".repeat(64)}`;
  const claims = {
    iss: "https://proofcart.example",
    aud: "https://demomart.example",
    sub: "user:00000000-0000-4000-8000-000000000001",
    merchantId: "demomart",
    contractId: "c_7f2",
    contractVersion: 8,
    contractHash: hash,
    executionId: "11111111-1111-4111-8111-111111111111",
    maxTotalMinor: 88500,
    currency: "USD",
    instrumentRef: "sandbox:visa-test-card",
  } as const;
  const expect0 = {
    resolveKey,
    audience: "https://demomart.example/",
    merchantId: "demomart",
    amountMinor: 87037,
    currency: "USD",
    contractHash: hash,
    now: now + 5,
  };

  it("accepts a grant within its scope", async () => {
    const { jws, claims: minted } = await mintGrant(claims, key, { now });
    expect(minted.exp - minted.iat).toBe(600);
    expect(await verifyGrant(jws, expect0)).toMatchObject({
      ok: true,
      grant: { maxTotalMinor: 88500 },
    });
  });

  it.each([
    ["over the maximum", { amountMinor: 88501 }, "amount_exceeds_grant"],
    [
      "another merchant origin",
      { audience: "https://evil.example" },
      "wrong_audience",
    ],
    ["another merchant id", { merchantId: "other" }, "wrong_merchant"],
    ["expired", { now: now + 600 }, "expired"],
    ["issued in the future", { now: now - 120 }, "not_yet_valid"],
    [
      "different contract",
      { contractHash: `sha256:${"c".repeat(64)}` },
      "contract_mismatch",
    ],
    ["other currency", { currency: "EUR" }, "currency_mismatch"],
    ["unknown key", { resolveKey: async () => null }, "unknown_key"],
  ] as const)("rejects %s", async (_name, override, reason) => {
    const { jws } = await mintGrant(claims, key, { now });
    expect(await verifyGrant(jws, { ...expect0, ...override })).toMatchObject({
      ok: false,
      reason,
    });
  });

  it("refuses to mint a grant that lives longer than 10 minutes", async () => {
    const { claims: minted } = await mintGrant(claims, key, {
      now,
      ttlSeconds: 3600,
    });
    expect(minted.exp - minted.iat).toBe(600);
  });
});
