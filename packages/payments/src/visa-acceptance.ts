// Thin typed client for the Visa Acceptance (Cybersource) REST API with HTTP
// Signature auth (shared secret, HmacSHA256). Only the calls ProofCart needs.

import { buf, fromBase64, toBase64, utf8 } from "@proofcart/tap";

export interface VisaAcceptanceConfig {
  /** `apitest.cybersource.com` (sandbox) or `api.cybersource.com`. */
  runEnvironment: string;
  merchantId: string;
  keyId: string;
  /** Base64 shared secret from the Business Center. */
  secretKey: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export const SANDBOX_HOST = "apitest.cybersource.com";

export function isSandbox(
  config: Pick<VisaAcceptanceConfig, "runEnvironment">,
) {
  return config.runEnvironment === SANDBOX_HOST;
}

async function sha256Base64(body: string): Promise<string> {
  return toBase64(
    new Uint8Array(await crypto.subtle.digest("SHA-256", utf8(body))),
  );
}

/**
 * Headers for one request: `v-c-merchant-id`, `date`, `host`, `digest` (with a
 * body) and `signature`. `date` is injectable for deterministic tests.
 */
export async function signedHeaders(
  config: VisaAcceptanceConfig,
  method: "GET" | "POST",
  path: string,
  body: string | undefined,
  date: Date = new Date(),
): Promise<Record<string, string>> {
  const host = config.runEnvironment;
  const headers: Record<string, string> = {
    "v-c-merchant-id": config.merchantId,
    date: date.toUTCString(),
    host,
  };
  const signed: [string, string][] = [
    ["host", host],
    ["date", headers.date as string],
    ["request-target", `${method.toLowerCase()} ${path}`],
  ];
  if (body !== undefined) {
    headers.digest = `SHA-256=${await sha256Base64(body)}`;
    signed.push(["digest", headers.digest]);
  }
  signed.push(["v-c-merchant-id", config.merchantId]);
  const signingString = signed.map(([k, v]) => `${k}: ${v}`).join("\n");
  const key = await crypto.subtle.importKey(
    "raw",
    buf(fromBase64(config.secretKey)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, utf8(signingString)),
  );
  headers.signature = [
    `keyid="${config.keyId}"`,
    `algorithm="HmacSHA256"`,
    `headers="${signed.map(([k]) => k).join(" ")}"`,
    `signature="${toBase64(mac)}"`,
  ].join(", ");
  return headers;
}

export interface BillTo {
  firstName: string;
  lastName: string;
  address1: string;
  locality: string;
  administrativeArea: string;
  postalCode: string;
  country: string;
  email: string;
}

/** Card data is only ever the public sandbox test card; production uses TMS. */
export type PaymentSource =
  | { kind: "tms_instrument"; instrumentId: string }
  | {
      kind: "sandbox_test_card";
      number: string;
      expirationMonth: string;
      expirationYear: string;
    };

export interface PaymentRequest {
  /** Our reference, e.g. `contractId@version` (max 50 characters). */
  reference: string;
  amountMinor: number;
  currency: string;
  source: PaymentSource;
  billTo: BillTo;
  capture: boolean;
  /** Merchant-defined data fields 1..n (max 100 characters each). */
  merchantDefined: string[];
}

export type PaymentStatus =
  | "AUTHORIZED"
  | "PARTIAL_AUTHORIZED"
  | "AUTHORIZED_PENDING_REVIEW"
  | "AUTHORIZED_RISK_DECLINED"
  | "PENDING_AUTHENTICATION"
  | "PENDING_REVIEW"
  | "DECLINED"
  | "INVALID_REQUEST"
  | "SERVER_ERROR";

export interface PaymentResponse {
  httpStatus: number;
  status: PaymentStatus | string;
  id: string | null;
  reconciliationId: string | null;
  approvalCode: string | null;
  reason: string | null;
  message: string | null;
  submitTimeUtc: string | null;
}

export function formatMinor(amountMinor: number): string {
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) {
    throw new RangeError(
      "amount must be a non-negative integer of minor units",
    );
  }
  const major = Math.floor(amountMinor / 100);
  return `${major}.${String(amountMinor % 100).padStart(2, "0")}`;
}

export function paymentBody(req: PaymentRequest): Record<string, unknown> {
  if (req.reference.length > 50)
    throw new RangeError("reference exceeds 50 characters");
  const paymentInformation =
    req.source.kind === "tms_instrument"
      ? { paymentInstrument: { id: req.source.instrumentId } }
      : {
          card: {
            number: req.source.number,
            expirationMonth: req.source.expirationMonth,
            expirationYear: req.source.expirationYear,
          },
        };
  return {
    clientReferenceInformation: { code: req.reference },
    processingInformation: {
      capture: req.capture,
      commerceIndicator: "internet",
    },
    paymentInformation,
    orderInformation: {
      amountDetails: {
        totalAmount: formatMinor(req.amountMinor),
        currency: req.currency,
      },
      billTo: req.billTo,
    },
    merchantDefinedInformation: req.merchantDefined.map((value, i) => {
      if (value.length > 100)
        throw new RangeError(`merchant-defined field ${i + 1} is too long`);
      return { key: String(i + 1), value };
    }),
  };
}

interface RawPaymentResponse {
  id?: string;
  status?: string;
  submitTimeUtc?: string;
  reconciliationId?: string;
  processorInformation?: { approvalCode?: string };
  errorInformation?: { reason?: string; message?: string };
  reason?: string;
  message?: string;
}

export class VisaAcceptanceClient {
  constructor(private readonly config: VisaAcceptanceConfig) {}

  get sandbox() {
    return isSandbox(this.config);
  }

  async createPayment(req: PaymentRequest): Promise<PaymentResponse> {
    if (req.source.kind === "sandbox_test_card" && !this.sandbox) {
      throw new Error("raw test cards are only allowed against the sandbox");
    }
    const path = "/pts/v2/payments";
    const body = JSON.stringify(paymentBody(req));
    const headers = await signedHeaders(this.config, "POST", path, body);
    const { host: _host, ...sendHeaders } = headers;
    const res = await (this.config.fetch ?? fetch)(
      `https://${this.config.runEnvironment}${path}`,
      {
        method: "POST",
        headers: {
          ...sendHeaders,
          "content-type": "application/json",
          accept: "application/hal+json",
        },
        body,
        signal: AbortSignal.timeout(this.config.timeoutMs ?? 20_000),
      },
    );
    let raw: RawPaymentResponse = {};
    try {
      raw = (await res.json()) as RawPaymentResponse;
    } catch {
      // Error responses are sometimes empty; keep going with the HTTP status.
    }
    return {
      httpStatus: res.status,
      status:
        raw.status ?? (res.status >= 500 ? "SERVER_ERROR" : "INVALID_REQUEST"),
      id: raw.id ?? null,
      reconciliationId: raw.reconciliationId ?? null,
      approvalCode: raw.processorInformation?.approvalCode ?? null,
      reason: raw.errorInformation?.reason ?? raw.reason ?? null,
      message: raw.errorInformation?.message ?? raw.message ?? null,
      submitTimeUtc: raw.submitTimeUtc ?? null,
    };
  }
}
