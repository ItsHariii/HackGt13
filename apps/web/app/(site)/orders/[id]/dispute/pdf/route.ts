import { formatMoneyText } from "@cartel/proof-engine";
import { formatStamp } from "@/lib/contract-view";
import { loadDispute } from "@/lib/dispute";
import { demoNotes } from "@/lib/evidence-pack";
import { logger } from "@/lib/logger";
import { renderDisputePdf } from "@/lib/pdf/dispute";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** The dispute packet as a PDF (TASKS T15.4). */
export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const url = new URL(request.url);
  try {
    const loaded = await loadDispute(id, {
      gtin: url.searchParams.get("gtin") ?? "",
      method: url.searchParams.get("method") ?? "",
    });
    if (!loaded) return Response.json({ error: "not_found" }, { status: 404 });
    const { record, packet } = loaded;
    const pdf = await renderDisputePdf(packet, {
      money: (m) => formatMoneyText(m, packet.approved.currency),
      stamp: formatStamp,
      generatedAt: new Date().toISOString(),
      notes: demoNotes(record),
    });
    return new Response(pdf as Uint8Array<ArrayBuffer>, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="dispute-${packet.merchantOrderId}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    logger.error({ err, orderId: id }, "dispute pdf failed");
    return Response.json({ error: "dispute_unavailable" }, { status: 503 });
  }
}
