import "server-only";
import { ACP_API_VERSION, type AcpError } from "@cartel/acp";
import type { TapTag } from "@cartel/tap";
import { toBase64Url, utf8 } from "@cartel/tap";
import type { z } from "zod";
import {
  type AgentIdentity,
  authenticateAgent,
  requestIdOf,
} from "../agent-auth";
import { logger } from "../logger";
import { db } from "../supabase/admin";

export class AcpHttpError extends Error {
  constructor(
    readonly status: number,
    readonly error: AcpError,
  ) {
    super(error.message);
  }
}

export function invalid(
  code: string,
  message: string,
  param?: string,
): AcpHttpError {
  return new AcpHttpError(400, {
    type: "invalid_request",
    code,
    message,
    ...(param ? { param } : {}),
  });
}

export function notFound(): AcpHttpError {
  return new AcpHttpError(404, {
    type: "invalid_request",
    code: "not_found",
    message: "No such checkout session.",
  });
}

export function conflict(code: string, message: string): AcpHttpError {
  return new AcpHttpError(409, { type: "invalid_request", code, message });
}

function headers(requestId: string, extra: Record<string, string> = {}) {
  return {
    "Request-Id": requestId,
    "API-Version": ACP_API_VERSION,
    "Cache-Control": "no-store",
    ...extra,
  };
}

export function acpJson(
  body: unknown,
  status: number,
  requestId: string,
  extra: Record<string, string> = {},
) {
  return Response.json(body, { status, headers: headers(requestId, extra) });
}

export function parseBody<T>(schema: z.ZodType<T>, raw: string): T {
  let json: unknown;
  try {
    json = raw.length ? JSON.parse(raw) : {};
  } catch {
    throw invalid("invalid_json", "The request body is not valid JSON.");
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const param = issue ? `$.${issue.path.join(".")}` : undefined;
    throw invalid(
      "invalid",
      issue ? `${param}: ${issue.message}` : "Invalid request.",
      param,
    );
  }
  return parsed.data;
}

async function sha256(input: string): Promise<string> {
  return toBase64Url(
    new Uint8Array(await crypto.subtle.digest("SHA-256", utf8(input))),
  );
}

export interface AcpContext {
  agent: AgentIdentity;
  body: string;
  requestId: string;
}

export interface AcpResponse {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
}

/**
 * The shared ACP route wrapper: API-Version check, RFC 9421 agent auth, then
 * Idempotency-Key handling for POSTs (replay the first response for the same
 * request, 409 for a different one), and ACP-shaped errors.
 */
export async function handleAcp(
  request: Request,
  opts: {
    tags: readonly TapTag[];
    idempotency: "required" | "optional" | "none";
    scope: string;
  },
  handler: (ctx: AcpContext) => Promise<AcpResponse>,
): Promise<Response> {
  const requestId = requestIdOf(request);
  const version = request.headers.get("api-version");
  if (version !== ACP_API_VERSION) {
    return acpJson(
      {
        type: "invalid_request",
        code: "unsupported_api_version",
        message: `API-Version must be ${ACP_API_VERSION}.`,
        param: "API-Version",
      },
      400,
      requestId,
    );
  }
  const body = await request.text();
  if (body.length > 64 * 1024) {
    return acpJson(
      {
        type: "invalid_request",
        code: "too_large",
        message: "Body exceeds 64 KB.",
      },
      413,
      requestId,
    );
  }
  const auth = await authenticateAgent(request, body, opts.tags);
  if (!auth.ok) return auth.response;
  const ctx: AcpContext = { agent: auth.agent, body, requestId };

  const key = request.headers.get("idempotency-key");
  if (opts.idempotency === "required" && !key) {
    return acpJson(
      {
        type: "invalid_request",
        code: "missing_idempotency_key",
        message: "Idempotency-Key is required.",
        param: "Idempotency-Key",
      },
      400,
      requestId,
    );
  }
  const useKey = opts.idempotency !== "none" && key;
  if (useKey && (key.length > 255 || !/^[\x21-\x7e]+$/.test(key))) {
    return acpJson(
      {
        type: "invalid_request",
        code: "invalid_idempotency_key",
        message: "Idempotency-Key is invalid.",
      },
      400,
      requestId,
    );
  }
  const scope = `${auth.agent.keyId}:${opts.scope}`;
  if (useKey) {
    const hash = await sha256(
      `${request.method} ${new URL(request.url).pathname}\n${body}`,
    );
    const { data, error } = await db().rpc("idem_begin", {
      p_scope: scope,
      p_key: key,
      p_request_hash: hash,
    });
    const row = data?.[0];
    if (error || !row) {
      logger.error(
        { err: error?.message, requestId },
        "idempotency lookup failed",
      );
      return acpJson(
        {
          type: "service_unavailable",
          code: "idempotency_unavailable",
          message: "Try again.",
        },
        503,
        requestId,
      );
    }
    if (row.state === "conflict") {
      return acpJson(
        {
          type: "request_not_idempotent",
          code: "idempotency_conflict",
          message: "This Idempotency-Key was used with a different request.",
        },
        409,
        requestId,
      );
    }
    if (row.state === "in_progress") {
      return acpJson(
        {
          type: "request_not_idempotent",
          code: "idempotency_in_progress",
          message: "The original request is still running.",
        },
        409,
        requestId,
        { "Retry-After": "1" },
      );
    }
    if (row.state === "replay") {
      return acpJson(row.response, row.status_code ?? 200, requestId, {
        "Idempotency-Key": key,
        "Idempotent-Replayed": "true",
      });
    }
  }

  let result: AcpResponse;
  try {
    result = await handler(ctx);
  } catch (e) {
    if (e instanceof AcpHttpError) {
      result = { status: e.status, body: e.error };
    } else {
      logger.error(
        {
          err: (e as Error).message,
          requestId,
          path: new URL(request.url).pathname,
        },
        "ACP handler failed",
      );
      if (useKey) await db().rpc("idem_abort", { p_scope: scope, p_key: key });
      return acpJson(
        {
          type: "processing_error",
          code: "internal_error",
          message: "Something went wrong.",
        },
        500,
        requestId,
      );
    }
  }
  if (useKey) {
    // 5xx responses are not stored, so the agent may retry them with the same key.
    if (result.status >= 500)
      await db().rpc("idem_abort", { p_scope: scope, p_key: key });
    else
      await db().rpc("idem_finish", {
        p_scope: scope,
        p_key: key,
        p_status_code: result.status,
        p_response: result.body as never,
      });
  }
  return acpJson(result.body, result.status, requestId, {
    ...(useKey ? { "Idempotency-Key": key } : {}),
    ...(result.headers ?? {}),
  });
}
