import { jsonResponse, UUID } from "@/lib/catalog";
import { logger } from "@/lib/logger";
import { paymentError, sameOrigin } from "@/lib/payment-config";
import { solveStoredPlan } from "@/lib/plan-solve";
import { limitCurrentRequest, tooManyRequests } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

const STATUS: Record<string, number> = {
  not_found: 404,
  no_rules: 409,
  no_candidates: 409,
  merchant_unavailable: 503,
  storage: 500,
};

/** Solves a saved plan into Plans A–C (lib/plan-solve.ts); the same work as "Find plans". */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    sameOrigin(request);
    const { id } = await context.params;
    if (!UUID.test(id)) return jsonResponse({ error: "invalid_plan_id" }, 400);
    const quota = await limitCurrentRequest("solve");
    if (!quota.allowed) return tooManyRequests(quota.retryAfterMs);
    const outcome = await solveStoredPlan(id);
    if (outcome.status === "error")
      return jsonResponse({ error: outcome.code }, STATUS[outcome.code] ?? 500);
    return jsonResponse(outcome, outcome.status === "solved" ? 201 : 200);
  } catch (error) {
    if (!(error instanceof Error && "status" in error))
      logger.error({ err: error }, "plan solve failed");
    return paymentError(error);
  }
}
