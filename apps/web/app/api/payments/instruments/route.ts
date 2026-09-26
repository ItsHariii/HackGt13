import { EnrollInput, type InstrumentRef, RAIL_LABELS } from "@cartel/payments";
import { jsonResponse, userId } from "@/lib/catalog";
import {
  authorizeNet,
  paymentError,
  paymentRailId,
  sameOrigin,
  visaEnrollment,
} from "@/lib/payment-config";
import { createAdminClient } from "@/lib/supabase/admin";
export async function GET() {
  try {
    const owner = await userId();
    const { data, error } = await createAdminClient()
      .from("payment_instruments")
      .select("id,rail,brand,last4,exp_month,exp_year")
      .eq("user_id", owner);
    if (error) throw error;
    const rail = paymentRailId();
    return jsonResponse({
      instruments: data,
      rail,
      label: RAIL_LABELS[rail],
      ...(rail === "authorize_net"
        ? {
            apiLoginId: process.env.AUTHORIZE_NET_API_LOGIN_ID,
            clientKey: process.env.NEXT_PUBLIC_AUTHORIZE_NET_CLIENT_KEY,
          }
        : {}),
    });
  } catch (error) {
    return paymentError(error);
  }
}
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const owner = await userId();
    const text = await request.text();
    if (text.length > 24000)
      return jsonResponse({ error: "invalid_enrollment" }, 400);
    const parsed = EnrollInput.safeParse(JSON.parse(text));
    if (!parsed.success)
      return jsonResponse({ error: "invalid_enrollment" }, 400);
    const input = parsed.data;
    if (input.rail !== paymentRailId())
      return jsonResponse({ error: "rail_mismatch" }, 409);
    let instrument: InstrumentRef;
    if (input.rail === "visa_acceptance")
      instrument = await visaEnrollment().enroll(
        input.transientToken,
        input.billTo,
        owner,
      );
    else if (input.rail === "authorize_net")
      instrument = await authorizeNet().enroll(input.opaqueData, owner);
    else
      instrument = {
        railRef: `simulated:${crypto.randomUUID()}`,
        brand: "Simulated",
        last4: null,
        expMonth: null,
        expYear: null,
      };
    const { data, error } = await createAdminClient()
      .from("payment_instruments")
      .insert({
        user_id: owner,
        rail: input.rail,
        rail_ref: instrument.railRef,
        brand: instrument.brand,
        last4: instrument.last4,
        exp_month: instrument.expMonth,
        exp_year: instrument.expYear,
      })
      .select("id,rail,brand,last4,exp_month,exp_year")
      .single();
    if (error) throw error;
    return jsonResponse(data, 201);
  } catch (error) {
    return paymentError(error);
  }
}
