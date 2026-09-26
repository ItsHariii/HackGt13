import { requestId } from "@cartel/platform/request-id";
import { adminTokenMatches } from "@/lib/admin-token";
import { logger } from "@/lib/logger";
import { mandateErrorCode, runMandateTick } from "@/lib/mandates";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GreatHub's Chaos Panel "Run mandate tick now" (T14.6): runs the cron's
 * `mandates_tick()` and drains the queue in this request, so the demo does
 * not wait for the 15 s schedule or for pg_net. `Authorization: Bearer ADMIN_TOKEN`.
 */
export async function POST(request: Request) {
  const id = requestId(request.headers.get("x-request-id"));
  if (!(await adminTokenMatches(request.headers.get("authorization"))))
    return Response.json(
      { error: "admin_required" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  const started = Date.now();
  try {
    const result = await runMandateTick(id);
    return Response.json(
      { ...result, ms: Date.now() - started },
      { headers: { "Cache-Control": "no-store", "x-request-id": id } },
    );
  } catch (err) {
    logger.warn({ requestId: id, err }, "mandate tick failed");
    return Response.json(
      { error: mandateErrorCode(err) },
      {
        status: 503,
        headers: { "Cache-Control": "no-store", "x-request-id": id },
      },
    );
  }
}
