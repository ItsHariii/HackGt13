import { UpdateSessionRequest } from "@cartel/acp";
import { handleAcp, parseBody } from "@/lib/acp/http";
import {
  loadSession,
  persistView,
  renderSession,
  updateSession,
} from "@/lib/acp/sessions";
import { merchantOrigin } from "@/lib/config";

export const dynamic = "force-dynamic";

/** Re-read the authoritative cart state (SDD §13.2); priced live from the catalog. */
export async function GET(
  request: Request,
  ctx: RouteContext<"/acp/checkout_sessions/[id]">,
) {
  const { id } = await ctx.params;
  return handleAcp(
    request,
    { tags: ["agent-browser-auth"], idempotency: "none", scope: `get:${id}` },
    async ({ agent }) => {
      const row = await loadSession(id, agent.keyId);
      const view = await renderSession(row, merchantOrigin(request));
      await persistView(row, view);
      const revision = view.session.x_cartel?.revision;
      return {
        status: 200,
        body: view.session,
        ...(revision ? { headers: { ETag: `"${revision}"` } } : {}),
      };
    },
  );
}

export async function POST(
  request: Request,
  ctx: RouteContext<"/acp/checkout_sessions/[id]">,
) {
  const { id } = await ctx.params;
  return handleAcp(
    request,
    {
      tags: ["agent-browser-auth"],
      idempotency: "optional",
      scope: `update:${id}`,
    },
    async ({ agent, body }) => {
      const req = parseBody(UpdateSessionRequest, body);
      const row = await updateSession(await loadSession(id, agent.keyId), req);
      const view = await renderSession(row, merchantOrigin(request));
      await persistView(row, view);
      return { status: 200, body: view.session };
    },
  );
}
