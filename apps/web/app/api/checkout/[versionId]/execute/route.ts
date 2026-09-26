import { jsonResponse, UUID, userId } from "@/lib/catalog";
import { runCheckout } from "@/lib/checkout";
import { paymentError, sameOrigin } from "@/lib/payment-config";
export async function POST(
  request: Request,
  ctx: { params: Promise<{ versionId: string }> },
) {
  try {
    sameOrigin(request);
    const owner = await userId();
    const { versionId } = await ctx.params;
    const key = request.headers.get("idempotency-key") ?? "";
    if (!UUID.test(versionId) || !/^[\x21-\x7e]{8,255}$/.test(key))
      return jsonResponse({ error: "invalid_request" }, 400);
    const body = await request.json();
    if (
      !body ||
      Object.keys(body).some((k) => k !== "instrumentId") ||
      !UUID.test(body.instrumentId ?? "")
    )
      return jsonResponse({ error: "invalid_instrument" }, 400);
    const result = await runCheckout(versionId, owner, key, body.instrumentId);
    return jsonResponse(
      result,
      result.status === "paused"
        ? 409
        : result.status === "reconcile_required"
          ? 202
          : result.status === "declined"
            ? 402
            : 200,
    );
  } catch (error) {
    return paymentError(error);
  }
}
