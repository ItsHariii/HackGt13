import { isConfigured } from "@proofcart/platform/env";
import { healthReport } from "@proofcart/platform/health";
import { requestId } from "@proofcart/platform/request-id";
import { logger } from "@/lib/logger";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const id = requestId(request.headers.get("x-request-id"));
  const result = await healthReport({
    service: "web",
    requestId: id,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabaseKey: process.env.SUPABASE_SECRET_KEY,
    jwksUrl: process.env.PROOFCART_JWKS_URL,
    publicEnvReady: isConfigured(
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    ),
  });
  logger.info({ requestId: id, checks: result.body.checks }, "Readiness check");
  return Response.json(result.body, {
    status: result.statusCode,
    headers: { "Cache-Control": "no-store", "x-request-id": id },
  });
}
