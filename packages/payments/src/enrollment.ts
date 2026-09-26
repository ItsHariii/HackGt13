import { z } from "zod";
import {
  type BillTo,
  signedHeaders,
  type VisaAcceptanceConfig,
} from "./visa-acceptance";

export const BillToInput = z.strictObject({
  firstName: z.string().min(1).max(60),
  lastName: z.string().min(1).max(60),
  address1: z.string().min(1).max(100),
  locality: z.string().min(1).max(50),
  administrativeArea: z.string().min(1).max(50),
  postalCode: z.string().min(1).max(20),
  country: z.string().regex(/^[A-Z]{2}$/),
  email: z.email().max(254),
});
export const EnrollInput = z.discriminatedUnion("rail", [
  z.strictObject({
    rail: z.literal("visa_acceptance"),
    transientToken: z.string().min(20).max(16384),
    billTo: BillToInput,
  }),
  z.strictObject({
    rail: z.literal("authorize_net"),
    opaqueData: z.strictObject({
      dataDescriptor: z.literal("COMMON.ACCEPT.INAPP.PAYMENT"),
      dataValue: z.string().min(1).max(4096),
    }),
  }),
  z.strictObject({ rail: z.literal("simulated") }),
]);
export type EnrollInput = z.infer<typeof EnrollInput>;
export interface InstrumentRef {
  railRef: string;
  brand: string | null;
  last4: string | null;
  expMonth: number | null;
  expYear: number | null;
}

/** No request accepts PAN/CVV. Never log requests, transient tokens or provider bodies. */
export class VisaEnrollment {
  constructor(private readonly config: VisaAcceptanceConfig) {}
  private async request(path: string, data?: unknown): Promise<Response> {
    const body = data === undefined ? undefined : JSON.stringify(data);
    const method = body === undefined ? "GET" : "POST";
    const { host: _host, ...headers } = await signedHeaders(
      this.config,
      method,
      path,
      body,
    );
    return (this.config.fetch ?? fetch)(
      `https://${this.config.runEnvironment}${path}`,
      {
        method,
        headers: { ...headers, "content-type": "application/json" },
        ...(body ? { body } : {}),
        signal: AbortSignal.timeout(this.config.timeoutMs ?? 20000),
        redirect: "error",
        cache: "no-store",
      },
    );
  }
  async captureContext(origin: string) {
    const url = new URL(origin);
    if (
      url.origin !== origin ||
      (url.protocol !== "https:" && url.hostname !== "localhost")
    )
      throw new Error("invalid_capture_origin");
    const res = await this.request("/microform/v2/sessions", {
      clientVersion: "v2",
      targetOrigins: [origin],
      allowedCardNetworks: ["VISA", "MASTERCARD", "AMEX"],
      transientTokenResponseOptions: { includeCardPrefix: false },
    });
    if (!res.ok) throw new Error("capture_context_failed");
    const text = await res.text();
    const context = text.startsWith('"') ? (JSON.parse(text) as string) : text;
    const payload = JSON.parse(
      Buffer.from(context.split(".")[1] ?? "", "base64url").toString(),
    );
    const data = payload.ctx?.[0]?.data;
    const library = new URL(data?.clientLibrary);
    if (
      library.protocol !== "https:" ||
      !["testflex.cybersource.com", "flex.cybersource.com"].includes(
        library.hostname,
      ) ||
      !/^sha(256|384|512)-/.test(data?.clientLibraryIntegrity ?? "")
    )
      throw new Error("invalid_capture_library");
    return {
      captureContext: context,
      clientLibrary: library.href,
      clientLibraryIntegrity: data.clientLibraryIntegrity as string,
    };
  }
  async enroll(
    transientToken: string,
    billTo: BillTo,
    reference: string,
  ): Promise<InstrumentRef> {
    // Documented alternative: zero-value authorization plus TOKEN_CREATE. TMS
    // must be enabled for the merchant. No purchase capture occurs here.
    const res = await this.request("/pts/v2/payments", {
      clientReferenceInformation: { code: reference.slice(0, 50) },
      processingInformation: {
        capture: false,
        commerceIndicator: "internet",
        actionList: ["TOKEN_CREATE"],
        actionTokenTypes: ["customer", "paymentInstrument"],
      },
      tokenInformation: { transientTokenJwt: transientToken },
      orderInformation: {
        amountDetails: { totalAmount: "0.00", currency: "USD" },
        billTo,
      },
    });
    const raw = await res.json();
    const id = raw.tokenInformation?.paymentInstrument?.id;
    if (
      !res.ok ||
      raw.status !== "AUTHORIZED" ||
      !/^[A-Za-z0-9]{1,64}$/.test(id ?? "") ||
      !raw.tokenInformation?.customer?.id
    )
      throw new Error("enrollment_failed");
    const details = await this.request(`/tms/v1/paymentinstruments/${id}`);
    if (!details.ok) throw new Error("instrument_details_failed");
    const instrument = await details.json();
    const card = instrument.card ?? {};
    const last4 = String(
      instrument._embedded?.instrumentIdentifier?.card?.number ??
        card.number ??
        "",
    ).slice(-4);
    return {
      railRef: `tms:${id}`,
      brand:
        (
          {
            "001": "Visa",
            "002": "Mastercard",
            "003": "American Express",
            visa: "Visa",
            mastercard: "Mastercard",
            amex: "American Express",
          } as Record<string, string>
        )[String(card.type).toLowerCase()] ?? null,
      last4: /^\d{4}$/.test(last4) ? last4 : null,
      expMonth: Number(card.expirationMonth) || null,
      expYear: Number(card.expirationYear) || null,
    };
  }
}
