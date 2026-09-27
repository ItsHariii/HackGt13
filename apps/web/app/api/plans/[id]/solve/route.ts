import { jsonResponse, UUID } from "@/lib/catalog";
import { logger } from "@/lib/logger";
import { paymentError, sameOrigin } from "@/lib/payment-config";
import { solveStoredPlan } from "@/lib/plan-solve";
import { limitCurrentRequest, tooManyRequests } from "@/lib/rate-limit";
import type { SolveLine } from "@/lib/solve-progress";

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

const NDJSON = "application/x-ndjson";

/**
 * Solves a saved plan into Plans A–C (lib/plan-solve.ts); the same work as
 * "Find plans". With `Accept: application/x-ndjson` it streams each step as
 * a line (lib/solve-progress.ts) and ends with `done` or `error`; `?plan=B`
 * streams that plan's proof instead of the first one's.
 */
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
    if (request.headers.get("accept")?.includes(NDJSON)) {
      const plan = new URL(request.url).searchParams.get("plan");
      return streamSolve(id, plan && /^[A-C]$/.test(plan) ? plan : undefined);
    }
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

function streamSolve(planId: string, focus: string | undefined): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    // Runs inside the request, so the solve still reads the caller's session.
    async start(controller) {
      let open = true;
      const send = (line: SolveLine) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(line)}\n`));
        } catch {
          // The client left; the solve still finishes and is stored.
          open = false;
        }
      };
      try {
        const outcome = await solveStoredPlan(planId, send, focus);
        send(
          outcome.status === "error"
            ? { phase: "error", code: outcome.code }
            : { phase: "done", outcome: outcome.status },
        );
      } catch (err) {
        logger.error({ err }, "plan solve failed");
        send({ phase: "error", code: "storage" });
      }
      if (open) controller.close();
    },
  });
  return new Response(body, {
    headers: {
      "Content-Type": `${NDJSON}; charset=utf-8`,
      "Cache-Control": "private, no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
