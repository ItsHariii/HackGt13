import { isConfigured } from "@proofcart/platform/env";
import { forbidden, isAdminRequest } from "@/lib/admin";
import { proofcartUrl } from "@/lib/config";

export const dynamic = "force-dynamic";

/**
 * "Run mandate tick now" (T6.10, T14.6): asks ProofCart's worker to evaluate
 * armed mandates immediately instead of waiting for the 15 s cron.
 */
export async function POST(request: Request) {
  if (!(await isAdminRequest(request))) return forbidden();
  const url = proofcartUrl("/api/internal/mandates/tick");
  const token = process.env.ADMIN_TOKEN;
  if (!url || !isConfigured(token)) {
    return Response.json(
      {
        ok: false,
        message: "PROOFCART_BASE_URL or ADMIN_TOKEN is not configured.",
      },
      { status: 503 },
    );
  }
  const started = Date.now();
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ source: "demomart-chaos-panel" }),
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
    const body = await res.json().catch(() => null);
    return Response.json(
      {
        ok: res.ok,
        status: res.status,
        ms: Date.now() - started,
        result: body,
      },
      { status: res.ok ? 200 : 502 },
    );
  } catch (e) {
    return Response.json(
      {
        ok: false,
        message: `ProofCart did not answer: ${(e as Error).message}`,
      },
      { status: 502 },
    );
  }
}
