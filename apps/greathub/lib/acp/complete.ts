import "server-only";
import type {
  Address,
  Buyer,
  CompleteSessionRequest,
  Message,
} from "@cartel/acp";
import {
  ContractBody,
  ContractSignature,
  contractHash,
  verifyContractSignature,
} from "@cartel/contracts";
import { type BillTo, type ChargeOutcome, verifyGrant } from "@cartel/payments";
import { cartelKeys } from "../agent-auth";
import { cartelWebAuthn, keyRoles, MERCHANT_ID } from "../config";
import { logger } from "../logger";
import { merchantRail } from "../rail";
import { db } from "../supabase/admin";
import { deliverSoon, orderEvent } from "../webhooks";
import { AcpHttpError, type AcpResponse, conflict, invalid } from "./http";
import { randomId, renderSession, type SessionRow } from "./sessions";

function rejected(status: number, code: string, message: string): AcpHttpError {
  return new AcpHttpError(status, { type: "invalid_request", code, message });
}

function billTo(buyer: Buyer | null, address: Address | null): BillTo {
  const [first, ...rest] = (
    address?.name ??
    `${buyer?.first_name ?? "GreatHub"} ${buyer?.last_name ?? "Customer"}`
  )
    .trim()
    .split(/\s+/);
  return {
    firstName: buyer?.first_name ?? first ?? "GreatHub",
    lastName: buyer?.last_name ?? (rest.join(" ") || "Customer"),
    address1: address?.line_one ?? "1 Test Merchant Way",
    locality: address?.city ?? "Atlanta",
    administrativeArea: address?.state ?? "GA",
    postalCode: address?.postal_code ?? "30332",
    country: address?.country ?? "US",
    email: buyer?.email ?? "orders@greathub.example",
  };
}

function declineMessage(outcome: ChargeOutcome): Message {
  return {
    type: "error",
    code: outcome.requires3ds ? "requires_3ds" : "payment_declined",
    param: "$.payment_data",
    content_type: "plain",
    content: outcome.requires3ds
      ? "The issuer requires authentication for this payment."
      : `The payment was declined${outcome.reason ? ` (${outcome.reason})` : ""}.`,
  };
}

async function release(sessionId: string, messages: Message[] | null) {
  const { error } = await db().rpc("release_session", {
    p_session_id: sessionId,
    p_messages: messages as never,
  });
  if (error)
    logger.error({ err: error.message, sessionId }, "release_session failed");
}

/**
 * POST /acp/checkout_sessions/{id}/complete (SDD §13.2, T6.7, T6.8). Checks, in
 * order: the signed contract, the scoped grant against the live total, the
 * contract ↔ cart match, the passkey signature; then charges the rail once and
 * records the order. Any failure before the charge leaves the session unpaid.
 */
export async function completeSession(
  row: SessionRow,
  req: CompleteSessionRequest,
  ctx: {
    origin: string;
    agentKeyId: string;
    agentTag: string | null;
    idempotencyKey: string;
  },
): Promise<AcpResponse> {
  if (row.status === "completed")
    throw conflict(
      "session_completed",
      "This checkout session is already completed.",
    );
  if (row.status === "canceled")
    throw conflict("session_canceled", "This checkout session was canceled.");
  if (req.payment_data.provider !== "cartel") {
    throw invalid(
      "unsupported_payment_provider",
      "GreatHub accepts Cartel scoped payment grants.",
      "$.payment_data.provider",
    );
  }
  const parsedBody = ContractBody.safeParse(req.x_cartel?.contract);
  if (!parsedBody.success) {
    throw invalid(
      "invalid_contract",
      "x_cartel.contract must be a cartel.contract/1 body.",
      "$.x_cartel.contract",
    );
  }
  const contract = parsedBody.data;
  const bodyHash = await contractHash(contract);
  const parsedSig = req.x_cartel?.signature
    ? ContractSignature.safeParse(req.x_cartel.signature)
    : null;
  if (parsedSig && !parsedSig.success) {
    throw invalid(
      "invalid_signature",
      "x_cartel.signature is malformed.",
      "$.x_cartel.signature",
    );
  }
  const webauthn = cartelWebAuthn();
  if (parsedSig && !webauthn) {
    throw new AcpHttpError(503, {
      type: "service_unavailable",
      code: "signature_verification_unavailable",
      message: "This merchant cannot verify contract signatures right now.",
    });
  }

  const { data: claimed, error: claimError } = await db().rpc("claim_session", {
    p_session_id: row.id,
    p_idempotency_key: ctx.idempotencyKey,
  });
  if (claimError)
    throw new Error(`claim_session failed: ${claimError.message}`);
  if (!claimed)
    throw conflict(
      "session_locked",
      "Payment for this session is already in progress.",
    );

  let finalized = false;
  try {
    // Price from the live catalog *after* taking the claim: this is what gets charged.
    const { data: fresh } = await db()
      .from("checkout_sessions")
      .select("*")
      .eq("id", row.id)
      .single();
    const view = await renderSession(fresh ?? row, ctx.origin);
    if (view.session.status !== "ready_for_payment") {
      await release(row.id, view.session.messages);
      return { status: 200, body: view.session };
    }
    const amount = view.totalMinor;

    // 1. Scoped grant: Cartel's grant key, this merchant, this amount, this contract.
    const keys = cartelKeys();
    if (!keys)
      throw new AcpHttpError(503, {
        type: "service_unavailable",
        code: "not_configured",
        message: "Cartel JWKS is not configured.",
      });
    const grantCheck = await verifyGrant(req.payment_data.token, {
      resolveKey: async (kid) =>
        kid.startsWith(keyRoles().grant)
          ? keys.getKey(kid).catch(() => null)
          : null,
      audience: ctx.origin,
      merchantId: MERCHANT_ID,
      amountMinor: amount,
      currency: view.session.currency,
      contractHash: bodyHash,
    });
    if (!grantCheck.ok) {
      throw rejected(
        grantCheck.reason === "amount_exceeds_grant" ? 422 : 403,
        `grant_${grantCheck.reason}`,
        grantCheck.reason === "amount_exceeds_grant"
          ? `The total is now above what the customer approved (${grantCheck.detail}).`
          : "The scoped payment grant was not accepted.",
      );
    }
    const grant = grantCheck.grant;

    // 2. The grant, the contract and this session all describe the same purchase.
    const ref = row.contract_ref as {
      contract_id?: string;
      version?: number;
      body_hash?: string;
    } | null;
    if (
      grant.contractId !== contract.contractId ||
      grant.contractVersion !== contract.version
    ) {
      throw rejected(
        409,
        "contract_mismatch",
        "The grant was issued for a different contract version.",
      );
    }
    if (
      ref &&
      (ref.contract_id !== contract.contractId ||
        ref.version !== contract.version ||
        ref.body_hash !== bodyHash)
    ) {
      throw rejected(
        409,
        "contract_mismatch",
        "This session was opened for a different contract.",
      );
    }
    if (Date.parse(contract.expiresAt) <= Date.now()) {
      throw rejected(
        409,
        "contract_expired",
        "The customer's contract has expired.",
      );
    }
    const merchant = contract.merchants.find((m) => m.id === MERCHANT_ID);
    if (!merchant || new URL(merchant.origin).origin !== ctx.origin) {
      throw rejected(
        409,
        "contract_mismatch",
        "The contract does not name this merchant.",
      );
    }
    const contracted = new Map(
      contract.items
        .filter((i) => i.merchant === MERCHANT_ID)
        .map((i) => [i.sku, i]),
    );
    const lines = view.session.line_items;
    if (lines.length !== contracted.size) {
      throw rejected(
        409,
        "contract_mismatch",
        "The cart and the contract list different items.",
      );
    }
    for (const line of lines) {
      const item = contracted.get(line.item.id);
      const x = line.item.x_cartel;
      if (!item || item.qty !== line.item.quantity) {
        throw rejected(
          409,
          "contract_mismatch",
          `${line.item.id} is not in the contract at this quantity.`,
        );
      }
      if (x && x.seller_id !== item.sellerId) {
        throw rejected(
          409,
          "seller_changed",
          `${line.item.id} is now sold by a different seller.`,
        );
      }
      if (x && item.gtin && x.ships_gtin !== item.gtin) {
        throw rejected(
          409,
          "item_substituted",
          `${line.item.id} would ship a different product (GTIN ${x.ships_gtin}).`,
        );
      }
    }

    // 3. The customer's passkey signature over exactly this body, from Cartel's origin.
    let signature: Record<string, unknown> = { status: "absent" };
    if (parsedSig?.success && webauthn) {
      const check = await verifyContractSignature(parsedSig.data, {
        bodyHash,
        expectedOrigin: webauthn.origin,
        expectedRpId: webauthn.rpId,
      });
      if (!check.ok)
        throw rejected(
          403,
          `signature_${check.reason}`,
          "The customer's contract signature did not verify.",
        );
      signature = {
        status: "verified",
        credentialId: parsedSig.data.credentialId,
        signedAt: parsedSig.data.signedAt,
        userVerified: check.userVerified,
        signCount: check.signCount,
      };
    }

    // 4. A grant pays for one order only.
    const { data: used } = await db()
      .from("orders")
      .select("id")
      .eq("grant_id", grant.jti)
      .maybeSingle();
    if (used)
      throw rejected(
        409,
        "grant_already_used",
        "This grant has already paid for an order.",
      );

    // 5. Charge. Contract linkage travels as reference + merchant-defined data.
    const rail = merchantRail();
    const outcome = await rail.charge({
      reference: `${contract.contractId}@${contract.version}`.slice(0, 50),
      amountMinor: amount,
      currency: view.session.currency,
      instrumentRef: grant.instrumentRef,
      billTo: billTo(
        (fresh?.buyer ?? row.buyer) as Buyer | null,
        (fresh?.fulfillment_address ??
          row.fulfillment_address) as Address | null,
      ),
      merchantDefined: [
        contract.contractId.slice(0, 100),
        bodyHash,
        grant.jti.slice(0, 100),
      ],
    });
    logger.info(
      {
        sessionId: row.id,
        rail: outcome.rail,
        status: outcome.railStatus,
        transactionId: outcome.transactionId,
        amount,
      },
      "charge attempted",
    );

    if (outcome.status === "declined") {
      const messages = [...view.session.messages, declineMessage(outcome)];
      await release(row.id, messages);
      return { status: 200, body: { ...view.session, messages } };
    }
    if (outcome.status === "error") {
      await release(row.id, null);
      throw new AcpHttpError(502, {
        type: "processing_error",
        code:
          outcome.railStatus === "TIMEOUT"
            ? "payment_timeout"
            : "payment_processor_error",
        message: outcome.message ?? "The payment processor returned an error.",
      });
    }

    // 6. Record the order atomically (session frozen, stock taken, order_created queued).
    const orderId = randomId("dm_ord_", 16);
    const verification = {
      contract: {
        id: contract.contractId,
        version: contract.version,
        bodyHash,
        expiresAt: contract.expiresAt,
      },
      grant: {
        status: "verified",
        id: grant.jti,
        maxTotalMinor: grant.maxTotalMinor,
        expiresAt: grant.exp,
      },
      signature,
      agent: { keyId: ctx.agentKeyId, tag: ctx.agentTag },
      verifiedAt: new Date().toISOString(),
    };
    const payment = {
      rail: outcome.rail,
      railLabel: outcome.railLabel,
      transactionId: outcome.transactionId,
      status: outcome.railStatus,
      reconciliationId: outcome.reconciliationId,
      approvalCode: outcome.approvalCode,
      reference: `${contract.contractId}@${contract.version}`.slice(0, 50),
    };
    const orderStatus =
      outcome.status === "pending_review" ? "manual_review" : "confirmed";
    const completed = {
      ...view.session,
      status: "completed" as const,
      messages: [],
      order: {
        id: orderId,
        checkout_session_id: row.id,
        permalink_url: `${ctx.origin}/orders/${orderId}`,
      },
    };
    const eventBase = {
      id: orderId,
      checkout_session_id: row.id,
      status: orderStatus,
      total_minor: amount,
      currency: view.session.currency,
      payment,
      contract_ref: {
        contract_id: contract.contractId,
        version: contract.version,
        body_hash: bodyHash,
      },
    };
    const event = orderEvent(eventBase as never, "order_created", ctx.origin);
    const { error: finalizeError } = await db().rpc("finalize_order", {
      p_session_id: row.id,
      p_order: {
        id: orderId,
        status: orderStatus,
        total_minor: amount,
        currency: view.session.currency,
        payment,
        contract_verification: verification,
        grant_id: grant.jti,
        agent_key_id: ctx.agentKeyId,
      } as never,
      p_snapshot: completed as never,
      p_event: event as never,
    });
    if (finalizeError) {
      // The card was charged but the order didn't save. Keep the claim so no second charge can
      // start, and log everything needed to reconcile by hand.
      logger.fatal(
        {
          sessionId: row.id,
          orderId,
          transactionId: outcome.transactionId,
          err: finalizeError.message,
        },
        "charged but finalize_order failed; reconcile manually",
      );
      finalized = true;
      throw new AcpHttpError(500, {
        type: "processing_error",
        code: "order_not_recorded",
        message: `Payment ${outcome.transactionId} was taken but the order was not recorded. Do not retry; contact GreatHub.`,
      });
    }
    finalized = true;
    deliverSoon();
    return { status: 200, body: completed };
  } finally {
    if (!finalized) {
      // Errors thrown above (grant, contract, signature) end here; free the session for a retry.
      const { data } = await db()
        .from("checkout_sessions")
        .select("completing_at")
        .eq("id", row.id)
        .maybeSingle();
      if (data?.completing_at) await release(row.id, null);
    }
  }
}
