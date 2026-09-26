import { describe, expect, it } from "vitest";
import { AcpClient, type Signer } from "./client";
import { ACP_API_VERSION, type CheckoutSession } from "./types";

const SESSION: CheckoutSession = {
  id: "cs_1",
  status: "ready_for_payment",
  currency: "usd",
  line_items: [
    {
      id: "li_1",
      item: { id: "vireo-u2727", quantity: 1 },
      base_amount: 32900,
      discount: 0,
      subtotal: 32900,
      tax: 2632,
      total: 35532,
    },
  ],
  fulfillment_options: [
    {
      type: "shipping",
      id: "std",
      title: "Standard",
      subtotal: 0,
      tax: 0,
      total: 0,
    },
  ],
  totals: [
    { type: "items_base_amount", display_text: "Items", amount: 32900 },
    { type: "subtotal", display_text: "Subtotal", amount: 32900 },
    { type: "fulfillment", display_text: "Shipping", amount: 0 },
    { type: "tax", display_text: "Tax", amount: 2632 },
    { type: "fee", display_text: "Fee", amount: 0 },
    { type: "total", display_text: "Total", amount: 35532 },
  ],
  messages: [],
  links: [],
};

type Capture = {
  method: string;
  url: string;
  headers: Headers;
  body: string | undefined;
};

function client(handler: (req: Capture) => Promise<Response> | Response) {
  const calls: Capture[] = [];
  const signed: Array<{ method: string; url: string; tag: string }> = [];
  const signer: Signer = async ({ method, url, tag }) => {
    signed.push({ method, url, tag });
    return {
      "Signature-Input": 'sig1=("@method")',
      Signature: "sig1=:AA:",
    };
  };
  const acp = new AcpClient({
    baseUrl: "https://greathub.example/",
    signer,
    timeoutMs: 50,
    fetch: (async (input, init) => {
      const headers = new Headers(init?.headers);
      const captured: Capture = {
        method: init?.method ?? "GET",
        url: String(input),
        headers,
        body: typeof init?.body === "string" ? init.body : undefined,
      };
      calls.push(captured);
      return handler(captured);
    }) as typeof fetch,
  });
  return { acp, calls, signed };
}

function json(body: unknown, status = 200, requestId = "echoed-1") {
  return Response.json(body, {
    status,
    headers: { "Request-Id": requestId },
  });
}

describe("AcpClient", () => {
  it("sets API-Version, Request-Id and Idempotency-Key on POST", async () => {
    const { acp, calls } = client(() => json(SESSION));
    const result = await acp.createSession(
      { items: [{ id: "vireo-u2727", quantity: 1 }] },
      { requestId: "req-fixed", idempotencyKey: "idem-fixed" },
    );
    expect(result).toMatchObject({
      ok: true,
      status: 200,
      requestId: "echoed-1",
      data: { id: "cs_1" },
    });
    expect(calls).toHaveLength(1);
    const headers = calls[0]?.headers;
    expect(headers?.get("api-version")).toBe(ACP_API_VERSION);
    expect(headers?.get("request-id")).toBe("req-fixed");
    expect(headers?.get("idempotency-key")).toBe("idem-fixed");
    expect(headers?.get("content-type")).toBe("application/json");
    expect(calls[0]?.url).toBe(
      "https://greathub.example/acp/checkout_sessions",
    );
  });

  it("omits Idempotency-Key on GET and generates IDs when callers omit them", async () => {
    const { acp, calls } = client(() => json(SESSION));
    await acp.getSession("cs/1");
    const headers = calls[0]?.headers;
    expect(calls[0]?.method).toBe("GET");
    expect(calls[0]?.url).toBe(
      "https://greathub.example/acp/checkout_sessions/cs%2F1",
    );
    expect(headers?.get("idempotency-key")).toBeNull();
    expect(headers?.get("request-id")).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(calls[0]?.body).toBeUndefined();
  });

  it("signs create as agent-browser-auth and complete as agent-payer-auth", async () => {
    const { acp, signed } = client(() => json(SESSION));
    await acp.createSession({ items: [{ id: "sku", quantity: 1 }] });
    await acp.completeSession("cs_1", {
      payment_data: { token: "grant.jws", provider: "cartel" },
    });
    expect(signed.map((s) => s.tag)).toEqual([
      "agent-browser-auth",
      "agent-payer-auth",
    ]);
  });

  it("maps HTTP, invalid JSON, schema mismatch, network and timeout", async () => {
    const http = client(() =>
      json(
        {
          type: "invalid_request",
          code: "out_of_stock",
          message: "gone",
        },
        409,
      ),
    );
    expect(await http.acp.getSession("cs_1")).toMatchObject({
      ok: false,
      kind: "http",
      status: 409,
      error: { code: "out_of_stock" },
    });

    const badJson = client(
      () =>
        new Response("nope", {
          status: 200,
          headers: { "Request-Id": "r2" },
        }),
    );
    expect(await badJson.acp.getSession("cs_1")).toMatchObject({
      ok: false,
      kind: "invalid_response",
      requestId: "r2",
      error: { code: "invalid_json" },
    });

    const schema = client(() => json({ id: "cs_1" }));
    expect(await schema.acp.getSession("cs_1")).toMatchObject({
      ok: false,
      kind: "invalid_response",
      error: { code: "schema_mismatch" },
    });

    const network = client(() => {
      throw new TypeError("fetch failed");
    });
    expect(await network.acp.getSession("cs_1")).toMatchObject({
      ok: false,
      kind: "network",
      status: null,
      error: { code: "network_error" },
    });

    const timeout = client(() => {
      const err = new Error("aborted");
      err.name = "TimeoutError";
      throw err;
    });
    expect(await timeout.acp.getSession("cs_1")).toMatchObject({
      ok: false,
      kind: "timeout",
      error: { code: "timeout" },
    });
  });
});
