import {
  ensureStoredPack,
  flagshipPack,
  SIGNED_URL_TTL_S,
  signedPackUrl,
} from "@/lib/evidence-pack";
import { FLAGSHIP_ORDER } from "@/lib/flagship";
import { logger } from "@/lib/logger";
import { storedOrder } from "@/lib/orders";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** A signed Storage URL for an order's Evidence Pack, with its sha256 (SDD §18.1). */
export async function GET(
  _request: Request,
  ctx: { params: Promise<{ orderId: string }> },
) {
  const { orderId } = await ctx.params;
  const headers = { "Cache-Control": "no-store" };
  if (orderId === FLAGSHIP_ORDER) {
    const pack = await flagshipPack();
    return Response.json(
      {
        url: `/orders/${FLAGSHIP_ORDER}/evidence-pack`,
        sha256: pack.sha256,
        demo: true,
      },
      { headers },
    );
  }
  const order = await storedOrder(orderId);
  if (!order)
    return Response.json({ error: "not_found" }, { status: 404, headers });
  try {
    const pack = await ensureStoredPack(order.id);
    if (!pack)
      return Response.json({ error: "not_found" }, { status: 404, headers });
    return Response.json(
      {
        url: await signedPackUrl(pack.path, order.merchant_order_id),
        sha256: pack.sha256,
        expiresIn: SIGNED_URL_TTL_S,
      },
      { headers },
    );
  } catch (err) {
    logger.error({ err, orderId: order.id }, "evidence pack failed");
    return Response.json(
      { error: "evidence_pack_unavailable" },
      { status: 503, headers },
    );
  }
}
