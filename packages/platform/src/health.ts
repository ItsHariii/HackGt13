import { isHttpUrl, supabaseConfigured } from "./env";

type Check = "ok" | "unconfigured" | "error";
type HealthOptions = {
  service: string;
  requestId: string;
  supabaseUrl: string | undefined;
  supabaseKey: string | undefined;
  jwksUrl: string | undefined;
  publicEnvReady: boolean;
  fetcher?: typeof fetch;
};

export async function healthReport(options: HealthOptions) {
  const fetcher = options.fetcher ?? fetch;
  const databaseReady = supabaseConfigured(
    options.supabaseUrl,
    options.supabaseKey,
  );
  const jwksReady = isHttpUrl(options.jwksUrl);
  async function database(): Promise<Check> {
    if (!databaseReady) return "unconfigured";
    try {
      const response = await fetcher(
        `${options.supabaseUrl}/rest/v1/rpc/foundation_health`,
        {
          method: "POST",
          headers: {
            apikey: options.supabaseKey ?? "",
            "Content-Type": "application/json",
          },
          body: "{}",
          cache: "no-store",
          signal: AbortSignal.timeout(3000),
        },
      );
      return response.ok && (await response.json()) === true ? "ok" : "error";
    } catch {
      return "error";
    }
  }
  async function jwks(): Promise<Check> {
    if (!jwksReady) return "unconfigured";
    try {
      const response = await fetcher(options.jwksUrl as string, {
        cache: "no-store",
        signal: AbortSignal.timeout(3000),
        headers: { "x-request-id": options.requestId },
      });
      if (!response.ok) return "error";
      const body = await response.json();
      return Array.isArray(body.keys) &&
        body.keys.some(
          (key: Record<string, unknown>) =>
            key.kty === "OKP" &&
            key.crv === "Ed25519" &&
            typeof key.x === "string" &&
            typeof key.kid === "string" &&
            !key.d,
        )
        ? "ok"
        : "error";
    } catch {
      return "error";
    }
  }
  const [db, signingKeys] = await Promise.all([database(), jwks()]);
  const checks = {
    environment:
      databaseReady && options.publicEnvReady ? "ok" : "unconfigured",
    database: db,
    jwks: signingKeys,
  };
  const ok = Object.values(checks).every((check) => check === "ok");
  return {
    statusCode: ok ? 200 : 503,
    body: {
      service: options.service,
      status: ok ? "ok" : "degraded",
      requestId: options.requestId,
      checks,
    },
  };
}
