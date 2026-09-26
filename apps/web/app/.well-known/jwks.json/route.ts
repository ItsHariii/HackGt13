import { publicJwks } from "@proofcart/platform/jwks";
export const dynamic = "force-dynamic";
export function GET() {
  const keys = publicJwks(
    process.env.AGENT_SIGNING_JWK,
    process.env.AGENT_KEY_ID,
  );
  if (!keys)
    return Response.json(
      { error: "Signing identity is not configured" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  return Response.json(keys, {
    headers: { "Cache-Control": "public, max-age=300" },
  });
}
