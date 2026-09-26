import { CreateSessionRequest } from "@cartel/acp";
import { handleAcp, parseBody } from "@/lib/acp/http";
import { createSession, persistView, renderSession } from "@/lib/acp/sessions";
import { merchantOrigin } from "@/lib/config";

export const dynamic = "force-dynamic";

export function POST(request: Request) {
  return handleAcp(
    request,
    { tags: ["agent-browser-auth"], idempotency: "required", scope: "create" },
    async ({ agent, body }) => {
      const req = parseBody(CreateSessionRequest, body);
      const row = await createSession(
        req,
        agent.keyId,
        request.headers.get("idempotency-key"),
      );
      const view = await renderSession(row, merchantOrigin(request));
      await persistView(row, view);
      return { status: 201, body: view.session };
    },
  );
}
