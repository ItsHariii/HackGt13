import {
  ensureStoredPack,
  flagshipPack,
  signedPackUrl,
} from "@/lib/evidence-pack";
import { FLAGSHIP_ORDER } from "@/lib/flagship";
import { logger } from "@/lib/logger";
import { storedOrder } from "@/lib/orders";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Downloads an order's Evidence Pack (TASKS T15.1): a zip with the signed
 * contract, signature, proof report, sources, ledger excerpt, payment,
 * summary.pdf and verify.mjs. The demo order's pack is built from fixtures;
 * a stored order's comes from private Storage through a short-lived signed
 * URL, generated first if the queue hasn't made it yet. `?refresh=1`
 * rebuilds it so later ledger events (delivery scans) are included.
 */
export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  if (id === FLAGSHIP_ORDER) {
    const pack = await flagshipPack();
    return new Response(pack.zip as Uint8Array<ArrayBuffer>, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="evidence-pack-${FLAGSHIP_ORDER}.zip"`,
        "Cache-Control": "no-store",
        "X-Content-SHA256": pack.sha256,
      },
    });
  }
  // RLS: only the order's owner sees it.
  const order = await storedOrder(id);
  if (!order) return Response.json({ error: "not_found" }, { status: 404 });
  try {
    const refresh = new URL(request.url).searchParams.get("refresh") === "1";
    const pack = await ensureStoredPack(order.id, { refresh });
    if (!pack) return Response.json({ error: "not_found" }, { status: 404 });
    const url = await signedPackUrl(pack.path, order.merchant_order_id);
    return new Response(null, {
      status: 303,
      headers: { Location: url, "Cache-Control": "no-store" },
    });
  } catch (err) {
    logger.error({ err, orderId: order.id }, "evidence pack failed");
    return Response.json(
      { error: "evidence_pack_unavailable" },
      { status: 503 },
    );
  }
}
