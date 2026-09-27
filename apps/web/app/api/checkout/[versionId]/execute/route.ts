import { jsonResponse, UUID, userId } from "@/lib/catalog";
import { runCheckout } from "@/lib/checkout";
import type { CheckoutResult } from "@/lib/checkout-service";
import { receiptUrl } from "@/lib/orders";
import { paymentError, sameOrigin } from "@/lib/payment-config";
import { createClient } from "@/lib/supabase/server";
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
    // Made before any stream starts, while the request's cookies are in scope.
    const db = await createClient();
    if (request.headers.get("accept")?.includes("application/x-ndjson"))
      return streamed(versionId, owner, key, body.instrumentId, db);
    const result = await withReceipt(
      await runCheckout(versionId, owner, key, body.instrumentId),
      db,
    );
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

type Db = Awaited<ReturnType<typeof createClient>>;

/** A paid result carries its receipt page, so the checkout can go straight to it. */
async function withReceipt(
  result: CheckoutResult,
  db: Db,
): Promise<CheckoutResult & { receiptUrl?: string }> {
  if (result.status !== "paid") return result;
  const url = await receiptUrl(db, result.executionId).catch(() => null);
  return url ? { ...result, receiptUrl: url } : result;
}

function statusFor(result: CheckoutResult): number {
  return result.status === "paused"
    ? 409
    : result.status === "reconcile_required"
      ? 202
      : result.status === "declined"
        ? 402
        : 200;
}

/**
 * The same checkout as NDJSON (TASKS T11.7): one line per guard step as it
 * finishes, with its time, then the result the JSON response would carry.
 *   {"type":"step","step":"cart","ms":180,"detail":"ready_for_payment"}
 *   {"type":"result","httpStatus":200,"body":{…}}
 *   {"type":"error","httpStatus":409,"body":{"error":"…"}}
 */
function streamed(
  versionId: string,
  owner: string,
  key: string,
  instrumentId: string,
  db: Db,
) {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (line: unknown) =>
        controller.enqueue(encoder.encode(`${JSON.stringify(line)}\n`));
      try {
        const result = await withReceipt(
          await runCheckout(
            versionId,
            owner,
            key,
            instrumentId,
            (step, ms, detail) =>
              send({ type: "step", step, ms, ...(detail ? { detail } : {}) }),
          ),
          db,
        );
        send({ type: "result", httpStatus: statusFor(result), body: result });
      } catch (error) {
        const res = paymentError(error);
        send({
          type: "error",
          httpStatus: res.status,
          body: await res.json(),
        });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(body, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "private, no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
