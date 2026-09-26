import { ucpAgentProfile } from "@cartel/evidence";
import { publicJwks } from "@cartel/platform/jwks";
export const dynamic = "force-dynamic";
// Cartel's UCP platform profile. Shopify's catalog fetches it on every call (SDD §11.2).
export function GET() {
  const agent = publicJwks(
    process.env.AGENT_SIGNING_JWK,
    process.env.AGENT_KEY_ID,
  );
  return Response.json(ucpAgentProfile(agent ? { keys: agent.keys } : {}), {
    headers: { "Cache-Control": "public, max-age=300" },
  });
}
