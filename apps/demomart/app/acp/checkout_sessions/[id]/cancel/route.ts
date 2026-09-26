import { handleAcp } from "@/lib/acp/http";
import { cancelSession, loadSession, renderSession } from "@/lib/acp/sessions";
import { merchantOrigin } from "@/lib/config";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  ctx: RouteContext<"/acp/checkout_sessions/[id]/cancel">,
) {
  const { id } = await ctx.params;
  return handleAcp(
    request,
    {
      tags: ["agent-browser-auth"],
      idempotency: "optional",
      scope: `cancel:${id}`,
    },
    async ({ agent }) => {
      const origin = merchantOrigin(request);
      const row = await cancelSession(
        await loadSession(id, agent.keyId),
        origin,
      );
      return { status: 200, body: (await renderSession(row, origin)).session };
    },
  );
}
