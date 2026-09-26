import { proofcartJwks } from "@proofcart/platform/jwks";
export const dynamic = "force-dynamic";
export function GET() {
  const keys = proofcartJwks({
    agentJwk: process.env.AGENT_SIGNING_JWK,
    agentKid: process.env.AGENT_KEY_ID,
    grantJwk: process.env.GRANT_SIGNING_JWK,
    grantKid: process.env.GRANT_KEY_ID,
    previous: [
      {
        jwk: process.env.AGENT_SIGNING_JWK_PREVIOUS,
        kid: process.env.AGENT_KEY_ID_PREVIOUS,
      },
      {
        jwk: process.env.GRANT_SIGNING_JWK_PREVIOUS,
        kid: process.env.GRANT_KEY_ID_PREVIOUS,
      },
    ],
  });
  if (!keys)
    return Response.json(
      { error: "Signing identity is not configured" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  return Response.json(keys, {
    headers: { "Cache-Control": "public, max-age=300" },
  });
}
