import { jsonResponse, UUID, userId } from "@/lib/catalog";
import { handoffCheckout } from "@/lib/handoff";
import { paymentError, sameOrigin } from "@/lib/payment-config";
export async function POST(
  request: Request,
  ctx: { params: Promise<{ versionId: string }> },
) {
  try {
    sameOrigin(request);
    const owner = await userId();
    const { versionId } = await ctx.params;
    if (!UUID.test(versionId))
      return jsonResponse({ error: "invalid_version" }, 400);
    const result = await handoffCheckout(versionId, owner);
    return jsonResponse(result, result.status === "paused" ? 409 : 200);
  } catch (error) {
    return paymentError(error);
  }
}
