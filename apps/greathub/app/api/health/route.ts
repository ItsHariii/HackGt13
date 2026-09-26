import { isConfigured } from "@cartel/platform/env";
import { healthReport } from "@cartel/platform/health";
import { requestId } from "@cartel/platform/request-id";
import { logger } from "@/lib/logger";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const id = requestId(request.headers.get("x-request-id"));
  const result = await healthReport({
    service: "greathub",
    requestId: id,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabaseKey: process.env.SUPABASE_SECRET_KEY,
    jwksUrl: process.env.CARTEL_JWKS_URL,
    publicEnvReady: isConfigured(process.env.CARTEL_BASE_URL),
  });
  logger.info({ requestId: id, checks: result.body.checks }, "Readiness check");
  return Response.json(result.body, {
    status: result.statusCode,
    headers: { "Cache-Control": "no-store", "x-request-id": id },
  });
}
