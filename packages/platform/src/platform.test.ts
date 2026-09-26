import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { isConfigured, supabaseConfigured } from "./env";
import { healthReport } from "./health";
import { proofcartJwks, publicJwks } from "./jwks";
import { requestId } from "./request-id";

describe("configuration", () => {
  it("rejects missing credentials, template keys, and non-HTTP URLs", () => {
    expect(isConfigured("")).toBe(false);
    expect(isConfigured("sb_secret_xxx")).toBe(false);
    expect(supabaseConfigured("javascript:alert(1)", "key")).toBe(false);
    expect(
      supabaseConfigured(
        "http://127.0.0.1:54321",
        "sb_publishable_local-real-key",
      ),
    ).toBe(true);
  });
});

describe("request identity", () => {
  it("preserves safe IDs but replaces malformed/unbounded input", () => {
    expect(requestId("request_123")).toBe("request_123");
    expect(requestId("bad\r\nheader")).toMatch(/^[\da-f-]{36}$/);
    expect(requestId("a".repeat(65))).toHaveLength(36);
  });
});

describe("public signing keys", () => {
  it("exports only public fields, even if private input contains extra secrets", () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const raw = {
      ...privateKey.export({ format: "jwk" }),
      secret: "never-publish",
    };
    const result = publicJwks(JSON.stringify(raw), "test-key");
    expect(result?.keys[0]?.x).toBe(publicKey.export({ format: "jwk" }).x);
    expect(JSON.stringify(result)).not.toContain(raw.d);
    expect(JSON.stringify(result)).not.toContain("never-publish");
  });
  it("fails closed for placeholders and malformed keys", () => {
    expect(publicJwks("{", "test-key")).toBeNull();
    expect(publicJwks('{"d":"xxx"}', "test-key")).toBeNull();
  });
  it("publishes the agent and grant keys under their own key IDs", () => {
    const agent = generateKeyPairSync("ed25519").privateKey.export({
      format: "jwk",
    });
    const grant = generateKeyPairSync("ed25519").privateKey.export({
      format: "jwk",
    });
    const jwks = proofcartJwks({
      agentJwk: JSON.stringify(agent),
      agentKid: "pc-agent-test",
      grantJwk: JSON.stringify({ ...grant, kid: "pc-grant-test" }),
    });
    expect(jwks?.keys.map((k) => k.kid)).toEqual([
      "pc-agent-test",
      "pc-grant-test",
    ]);
    expect(JSON.stringify(jwks)).not.toContain(grant.d);
    expect(
      proofcartJwks({
        agentJwk: JSON.stringify(agent),
        agentKid: "pc-agent-test",
        grantJwk: "{",
      })?.keys,
    ).toHaveLength(1);
    expect(
      proofcartJwks({
        agentJwk: undefined,
        agentKid: "x",
        grantJwk: JSON.stringify(grant),
      }),
    ).toBeNull();
  });
  it("keeps a previous agent kid published during rotation", () => {
    const current = generateKeyPairSync("ed25519").privateKey.export({
      format: "jwk",
    });
    const retired = generateKeyPairSync("ed25519").privateKey.export({
      format: "jwk",
    });
    const grant = generateKeyPairSync("ed25519").privateKey.export({
      format: "jwk",
    });
    const jwks = proofcartJwks({
      agentJwk: JSON.stringify(current),
      agentKid: "pc-agent-new",
      grantJwk: JSON.stringify(grant),
      grantKid: "pc-grant-test",
      previous: [
        { jwk: JSON.stringify(retired), kid: "pc-agent-old" },
        { jwk: JSON.stringify(current), kid: "pc-agent-new" },
      ],
    });
    expect(jwks?.keys.map((k) => k.kid)).toEqual([
      "pc-agent-new",
      "pc-grant-test",
      "pc-agent-old",
    ]);
    expect(JSON.stringify(jwks)).not.toContain(retired.d);
  });
});

describe("readiness", () => {
  const options = {
    service: "web",
    requestId: "request_123",
    supabaseUrl: "http://localhost:54321",
    supabaseKey: "sb_secret_test-real",
    jwksUrl: "http://localhost:3000/.well-known/jwks.json",
    publicEnvReady: true,
  };
  it("does not call dependencies without configuration", async () => {
    const fetcher = vi.fn();
    const result = await healthReport({
      ...options,
      supabaseKey: undefined,
      jwksUrl: undefined,
      fetcher,
    });
    expect(result.statusCode).toBe(503);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("requires a database response AND usable public signing keys", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(true))
      .mockResolvedValueOnce(Response.json({ keys: [] }));
    expect((await healthReport({ ...options, fetcher })).statusCode).toBe(503);
  });
  it("reports healthy dependencies without leaking secrets", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(true))
      .mockResolvedValueOnce(
        Response.json({
          keys: [{ kty: "OKP", crv: "Ed25519", x: "public", kid: "key-1" }],
        }),
      );
    const result = await healthReport({ ...options, fetcher });
    expect(result.statusCode).toBe(200);
    expect(JSON.stringify(result)).not.toContain(options.supabaseKey);
  });
  it("turns network errors into bounded, sanitized failures", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error("sensitive upstream failure"));
    const result = await healthReport({ ...options, fetcher });
    expect(result.body.checks.database).toBe("error");
    expect(JSON.stringify(result)).not.toContain("sensitive");
  });
});
