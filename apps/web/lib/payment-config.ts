import "server-only";
import { CatalogError } from "@cartel/catalog/supabase";
import {
  AuthorizeNetRail,
  RAIL_LABELS,
  type RailId,
  VisaEnrollment,
} from "@cartel/payments";
import { CheckoutError } from "./checkout-service";
export function paymentRailId(): RailId {
  const value =
    process.env.PAYMENT_RAIL ??
    (process.env.VISA_ACCEPTANCE_MERCHANT_ID ? "visa_acceptance" : "simulated");
  if (!(value in RAIL_LABELS))
    throw new CheckoutError("payment_rail_unavailable", 503);
  return value as RailId;
}
export function visaEnrollment() {
  const e = process.env;
  if (
    !e.VISA_ACCEPTANCE_MERCHANT_ID ||
    !e.VISA_ACCEPTANCE_KEY_ID ||
    !e.VISA_ACCEPTANCE_SECRET_KEY
  )
    throw new CheckoutError("visa_not_configured", 503);
  if (e.VISA_ACCEPTANCE_RUN_ENV !== "apitest.cybersource.com")
    throw new CheckoutError("sandbox_required", 503);
  return new VisaEnrollment({
    runEnvironment: e.VISA_ACCEPTANCE_RUN_ENV,
    merchantId: e.VISA_ACCEPTANCE_MERCHANT_ID,
    keyId: e.VISA_ACCEPTANCE_KEY_ID,
    secretKey: e.VISA_ACCEPTANCE_SECRET_KEY,
  });
}
export function authorizeNet() {
  const e = process.env;
  if (!e.AUTHORIZE_NET_API_LOGIN_ID || !e.AUTHORIZE_NET_TRANSACTION_KEY)
    throw new CheckoutError("authorize_net_not_configured", 503);
  return new AuthorizeNetRail({
    apiLoginId: e.AUTHORIZE_NET_API_LOGIN_ID,
    transactionKey: e.AUTHORIZE_NET_TRANSACTION_KEY,
  });
}
export function appOrigin() {
  const configured = process.env.CARTEL_BASE_URL ?? process.env.WEBAUTHN_ORIGIN;
  if (!configured) throw new CheckoutError("app_origin_not_configured", 503);
  return new URL(configured).origin;
}
export function sameOrigin(request: Request) {
  if (request.headers.get("origin") !== appOrigin())
    throw new CheckoutError("origin_rejected", 403);
}
export function paymentError(error: unknown) {
  if (error instanceof CheckoutError || error instanceof CatalogError)
    return Response.json(
      { error: error.code },
      { status: error.status, headers: { "Cache-Control": "no-store" } },
    );
  return Response.json(
    { error: "payment_unavailable" },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}
