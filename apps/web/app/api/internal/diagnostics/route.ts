import { requestId } from "@proofcart/platform/request-id";
import * as Sentry from "@sentry/nextjs";
import { logger } from "@/lib/logger";
// Explicitly unavailable on deployed builds; useful for local Sentry wiring only.
export async function POST(request: Request) {
  if (process.env.NODE_ENV !== "development")
    return new Response(null, { status: 404 });
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return new Response(null, { status: 403 });
  const id = requestId(request.headers.get("x-request-id"));
  if (!process.env.SENTRY_DSN)
    return Response.json(
      { status: "unconfigured", requestId: id },
      { status: 503 },
    );
  const eventId = Sentry.withScope((scope) => {
    scope.setTag("request_id", id);
    return Sentry.captureException(new Error("Phase 1 diagnostic error"));
  });
  const flushed = await Sentry.flush(2000);
  logger.info({ requestId: id, eventId, flushed }, "Sentry diagnostic");
  return Response.json(
    { eventId, requestId: id, flushed },
    { headers: { "x-request-id": id, "Cache-Control": "no-store" } },
  );
}
