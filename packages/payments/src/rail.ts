import { type ContractBody, contractHash } from "@cartel/contracts";
import type { SigningKey } from "@cartel/tap";
import type { AuthorizeNetRail } from "./authorize-net";
import type { RailId } from "./charge";
import type { EnrollInput, InstrumentRef, VisaEnrollment } from "./enrollment";
import { mintGrant } from "./grant";

export interface ExecutionToken {
  id: string;
  bodyHash: string;
  amountMinor: number;
  currency: string;
  instrumentRef: string;
  rail: RailId;
}
export interface PreparedPayment {
  execution: ExecutionToken;
  contract: ContractBody;
}
export interface PaymentCredential {
  token: string;
  provider: "cartel";
}
export interface PaymentRail {
  id: RailId;
  enrollInstrument(input: EnrollInput, userId: string): Promise<InstrumentRef>;
  prepare(
    executionToken: string,
    contract: ContractBody,
  ): Promise<PreparedPayment>;
  authenticate?(prepared: PreparedPayment): Promise<void>;
  credentialFor(prepared: PreparedPayment): Promise<PaymentCredential>;
  reportOutcome?(prepared: PreparedPayment, outcome: unknown): Promise<void>;
}
export interface GuardedRailOptions {
  id: Exclude<RailId, "vic">;
  issuer: string;
  key: SigningKey;
  /** Must atomically consume the DB token, and return its server-owned linkage. */
  consume: (token: string) => Promise<ExecutionToken>;
  visa?: VisaEnrollment;
  authorizeNet?: AuthorizeNetRail;
}
/** Cartel's side of a rail. MerchantRail is the merchant-side charge adapter. */
export class GuardedPaymentRail implements PaymentRail {
  readonly id;
  private readonly prepared = new WeakMap<PreparedPayment, PreparedPayment>();
  constructor(private readonly options: GuardedRailOptions) {
    this.id = options.id;
  }
  async enrollInstrument(
    input: EnrollInput,
    userId: string,
  ): Promise<InstrumentRef> {
    if (input.rail !== this.id) throw new Error("rail_mismatch");
    if (input.rail === "visa_acceptance" && this.options.visa)
      return this.options.visa.enroll(
        input.transientToken,
        input.billTo,
        userId,
      );
    if (input.rail === "authorize_net" && this.options.authorizeNet)
      return this.options.authorizeNet.enroll(input.opaqueData, userId);
    if (input.rail === "simulated")
      return {
        railRef: `simulated:${crypto.randomUUID()}`,
        brand: "Simulated",
        last4: null,
        expMonth: null,
        expYear: null,
      };
    throw new Error("enrollment_unavailable");
  }
  async prepare(
    token: string,
    contract: ContractBody,
  ): Promise<PreparedPayment> {
    if (!token || contract.merchants.length !== 1)
      throw new Error("invalid_execution_scope");
    const execution = await this.options.consume(token);
    if (
      execution.id !== token ||
      execution.rail !== this.id ||
      execution.bodyHash !== (await contractHash(contract)) ||
      execution.currency !== contract.economics.currency ||
      execution.amountMinor > contract.economics.maxTotalMinor
    )
      throw new Error("execution_scope_mismatch");
    const prepared = { execution, contract: structuredClone(contract) };
    this.prepared.set(prepared, structuredClone(prepared));
    return prepared;
  }
  async credentialFor(prepared: PreparedPayment): Promise<PaymentCredential> {
    const saved = this.prepared.get(prepared);
    if (!saved) throw new Error("execution_token_consumed");
    this.prepared.delete(prepared);
    const { contract, execution } = saved;
    const merchant = contract.merchants[0];
    if (!merchant || (await contractHash(contract)) !== execution.bodyHash)
      throw new Error("execution_scope_mismatch");
    const grant = await mintGrant(
      {
        iss: this.options.issuer,
        aud: merchant.origin,
        sub: contract.subject,
        merchantId: merchant.id,
        contractId: contract.contractId,
        contractVersion: contract.version,
        contractHash: execution.bodyHash,
        executionId: execution.id,
        jti: `execution:${execution.id}`,
        // Bound to the refreshed total too: a cart increase after reproof cannot use headroom.
        maxTotalMinor: execution.amountMinor,
        quotedTotalMinor: execution.amountMinor,
        currency: execution.currency,
        instrumentRef: execution.instrumentRef,
      },
      this.options.key,
    );
    return { token: grant.jws, provider: "cartel" };
  }
}
/** Reserved VIC mapping: enroll → agent token → Payment Passkey → instruction
 * (contractId/bodyHash/merchant/amount) → retrieve credential → outcome signal. */
export class VicRail implements PaymentRail {
  readonly id = "vic" as const;
  async enrollInstrument(): Promise<InstrumentRef> {
    throw new Error("vic_credentials_required");
  }
  async prepare(): Promise<PreparedPayment> {
    throw new Error("vic_credentials_required");
  }
  async credentialFor(): Promise<PaymentCredential> {
    throw new Error("vic_credentials_required");
  }
}
