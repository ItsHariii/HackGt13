// A typed ACP checkout client. Every request carries API-Version, Request-Id and
// (for POST) an Idempotency-Key, and is signed per RFC 9421 when a signer is set.

import { type SigningKey, signRequest, type TapTag } from "@cartel/tap";
import type { z } from "zod";
import {
  ACP_API_VERSION,
  AcpError,
  CheckoutSession,
  type CompleteSessionRequest,
  type CreateSessionRequest,
  type UpdateSessionRequest,
} from "./types";

export type Signer = (req: {
  method: string;
  url: string;
  body?: string;
  tag: TapTag;
}) => Promise<Record<string, string>>;

/** Sign with an Ed25519 agent key (TAP profile). */
export function tapSigner(key: SigningKey, ttlSeconds = 300): Signer {
  return ({ method, url, body, tag }) =>
    signRequest(
      { method, url, headers: {} },
      { key, tag, ttlSeconds, ...(body !== undefined ? { body } : {}) },
    );
}

export interface AcpClientOptions {
  baseUrl: string;
  signer?: Signer;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export interface CallOptions {
  idempotencyKey?: string;
  requestId?: string;
  signal?: AbortSignal;
}

export type AcpFailureKind =
  | "http"
  | "network"
  | "timeout"
  | "invalid_response";

export type AcpResult<T> =
  | { ok: true; status: number; requestId: string; data: T }
  | {
      ok: false;
      kind: AcpFailureKind;
      status: number | null;
      requestId: string;
      error: AcpError;
    };

function uuid(): string {
  return crypto.randomUUID();
}

export class AcpClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(private readonly opts: AcpClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.fetchImpl = opts.fetch ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? 10_000;
  }

  createSession(body: CreateSessionRequest, call: CallOptions = {}) {
    return this.send(
      "POST",
      "/acp/checkout_sessions",
      body,
      "agent-browser-auth",
      call,
    );
  }

  updateSession(
    id: string,
    body: UpdateSessionRequest,
    call: CallOptions = {},
  ) {
    return this.send(
      "POST",
      `/acp/checkout_sessions/${enc(id)}`,
      body,
      "agent-browser-auth",
      call,
    );
  }

  /** Re-read the authoritative cart immediately before execution (SDD §13.2). */
  getSession(id: string, call: CallOptions = {}) {
    return this.send(
      "GET",
      `/acp/checkout_sessions/${enc(id)}`,
      undefined,
      "agent-browser-auth",
      call,
    );
  }

  completeSession(
    id: string,
    body: CompleteSessionRequest,
    call: CallOptions = {},
  ) {
    return this.send(
      "POST",
      `/acp/checkout_sessions/${enc(id)}/complete`,
      body,
      "agent-payer-auth",
      call,
    );
  }

  cancelSession(id: string, call: CallOptions = {}) {
    return this.send(
      "POST",
      `/acp/checkout_sessions/${enc(id)}/cancel`,
      {},
      "agent-browser-auth",
      call,
    );
  }

  private async send(
    method: "GET" | "POST",
    path: string,
    body: unknown,
    tag: TapTag,
    call: CallOptions,
  ): Promise<AcpResult<CheckoutSession>> {
    return this.request(method, path, body, tag, call, CheckoutSession);
  }

  async request<T>(
    method: "GET" | "POST",
    path: string,
    body: unknown,
    tag: TapTag,
    call: CallOptions,
    schema: z.ZodType<T>,
  ): Promise<AcpResult<T>> {
    const url = `${this.baseUrl}${path}`;
    const requestId = call.requestId ?? uuid();
    const text = body === undefined ? undefined : JSON.stringify(body);
    const headers: Record<string, string> = {
      Accept: "application/json",
      "API-Version": ACP_API_VERSION,
      "Request-Id": requestId,
    };
    if (text !== undefined) headers["Content-Type"] = "application/json";
    if (method === "POST")
      headers["Idempotency-Key"] = call.idempotencyKey ?? uuid();
    if (this.opts.signer) {
      Object.assign(
        headers,
        await this.opts.signer({
          method,
          url,
          tag,
          ...(text !== undefined ? { body: text } : {}),
        }),
      );
    }
    const signals = [AbortSignal.timeout(this.timeoutMs)];
    if (call.signal) signals.push(call.signal);

    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        method,
        headers,
        ...(text !== undefined ? { body: text } : {}),
        signal: AbortSignal.any(signals),
        cache: "no-store",
      });
    } catch (e) {
      const timeout = (e as Error).name === "TimeoutError";
      return failure(timeout ? "timeout" : "network", null, requestId, {
        type: "service_unavailable",
        code: timeout ? "timeout" : "network_error",
        message: timeout
          ? `No response within ${this.timeoutMs} ms`
          : "Merchant unreachable",
      });
    }
    const echoed = res.headers.get("request-id") ?? requestId;
    let json: unknown;
    try {
      json = await res.json();
    } catch {
      return failure("invalid_response", res.status, echoed, {
        type: "processing_error",
        code: "invalid_json",
        message: `HTTP ${res.status} with a non-JSON body`,
      });
    }
    if (!res.ok) {
      const parsed = AcpError.safeParse(json);
      return failure(
        "http",
        res.status,
        echoed,
        parsed.success
          ? parsed.data
          : {
              type: "processing_error",
              code: `http_${res.status}`,
              message: `HTTP ${res.status}`,
            },
      );
    }
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      return failure("invalid_response", res.status, echoed, {
        type: "processing_error",
        code: "schema_mismatch",
        message: parsed.error.issues
          .slice(0, 3)
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
      });
    }
    return {
      ok: true,
      status: res.status,
      requestId: echoed,
      data: parsed.data,
    };
  }
}

function enc(id: string) {
  return encodeURIComponent(id);
}

function failure<T>(
  kind: AcpFailureKind,
  status: number | null,
  requestId: string,
  error: AcpError,
): AcpResult<T> {
  return { ok: false, kind, status, requestId, error };
}
