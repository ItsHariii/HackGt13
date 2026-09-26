import { CompleteSessionRequest } from "@proofcart/acp";
import { completeSession } from "@/lib/acp/complete";
import { handleAcp, parseBody } from "@/lib/acp/http";
import { loadSession } from "@/lib/acp/sessions";
import { merchantOrigin } from "@/lib/config";

export const dynamic = "force-dynamic";
// The rail call plus the webhook retry schedule that runs after the response.
export const maxDuration = 60;

export async function POST(
  request: Request,
  ctx: RouteContext<"/acp/checkout_sessions/[id]/complete">,
) {
  const { id } = await ctx.params;
  return handleAcp(
    request,
    {
      tags: ["agent-payer-auth"],
      idempotency: "required",
      scope: `complete:${id}`,
    },
    async ({ agent, body }) => {
      const req = parseBody(CompleteSessionRequest, body);
      const row = await loadSession(id, agent.keyId);
      return completeSession(row, req, {
        origin: merchantOrigin(request),
        agentKeyId: agent.keyId,
        agentTag: agent.tag,
        idempotencyKey: request.headers.get("idempotency-key") ?? "",
      });
    },
  );
}
