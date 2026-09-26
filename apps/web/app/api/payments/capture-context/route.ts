import { jsonResponse, userId } from "@/lib/catalog";
import {
  appOrigin,
  paymentError,
  paymentRailId,
  sameOrigin,
  visaEnrollment,
} from "@/lib/payment-config";
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    await userId();
    if (paymentRailId() !== "visa_acceptance")
      return jsonResponse({ error: "rail_mismatch" }, 409);
    return jsonResponse(await visaEnrollment().captureContext(appOrigin()));
  } catch (error) {
    return paymentError(error);
  }
}
