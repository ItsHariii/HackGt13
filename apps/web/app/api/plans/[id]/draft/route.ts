import { aiRouter } from "@/lib/ai";
import { briefDraftStream } from "@/lib/brief-draft";
import { ALL_PACKS } from "@/lib/evidence";
import { logger } from "@/lib/logger";
import { loadStoredPlan, setPlanPack } from "@/lib/plans";
import { limitCurrentRequest, tooManyRequests } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NDJSON = {
  "Content-Type": "application/x-ndjson; charset=utf-8",
  "Cache-Control": "private, no-store, no-transform",
  "X-Accel-Buffering": "no",
};

/** A1 for a saved plan, streamed (lib/brief-draft.ts). */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const plan = await loadStoredPlan(id);
  if (!plan)
    return Response.json(
      { error: "plan_not_found" },
      { status: 404, headers: { "Cache-Control": "private, no-store" } },
    );
  const router = aiRouter();
  if (!router.available() || !plan.brief.trim())
    return new Response(
      `${JSON.stringify({ type: "error", reason: "off" })}\n`,
      {
        headers: NDJSON,
      },
    );
  const quota = await limitCurrentRequest("ai");
  if (!quota.allowed) return tooManyRequests(quota.retryAfterMs);
  const unpacked = plan.packs.length === 0;
  return new Response(
    briefDraftStream(
      router,
      {
        id: plan.id,
        brief: plan.brief,
        packs: unpacked ? ALL_PACKS : plan.packs,
      },
      {
        signal: request.signal,
        onPack: async (pack) => {
          if (!unpacked) return;
          await setPlanPack(plan.id, pack).catch((err) =>
            logger.warn({ err }, "plan pack update failed"),
          );
        },
        onError: (err) => logger.warn({ err }, "brief draft failed"),
      },
    ),
    { headers: NDJSON },
  );
}
