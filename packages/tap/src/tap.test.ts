import { describe, expect, it } from "vitest";
import { fromBase64, toBase64, utf8 } from "./base64";
import { contentDigest, verifyContentDigest } from "./digest";
import { edVerify } from "./ed25519";
import { JwksCache } from "./jwks";
import { signJws, verifyJws } from "./jws";
import {
  generateEd25519Jwk,
  importPrivateJwk,
  importPublicJwk,
  signingKeyFromEnv,
} from "./keys";
import {
  signatureBase,
  signBytes,
  signRequest,
  verifyRequest,
} from "./rfc9421";
import { type InnerList, parseDictionary } from "./structured";

// RFC 9421 Appendix B.1.4 (test-key-ed25519) and B.2 test request.
const RFC_PRIVATE_PKCS8 =
  "MC4CAQAwBQYDK2VwBCIEIJ+DYvh6SEqVTm50DFtMDoQikTmiCqirVv9mWG9qfSnF";
const RFC_PUBLIC_JWK = {
  kty: "OKP",
  crv: "Ed25519",
  x: "JrQLj5P_89iXES9-vFgrIy29clF9CC_oPPsw3c5D0bs",
} as const;
const RFC_BODY = '{"hello": "world"}';
const rfcRequest = {
  method: "POST",
  url: "https://example.com/foo?param=Value&Pet=dog",
  headers: new Headers({
    Host: "example.com",
    Date: "Tue, 20 Apr 2021 02:07:55 GMT",
    "Content-Type": "application/json",
    "Content-Digest":
      "sha-512=:WZDPaVn/7XgHaAy8pmojAkGWoRx2UFChF41A2svX+TaPm+AbwAgBWnrIiYllu7BNNyealdVLvRwEmTHWXvJwew==:",
    "Content-Length": "18",
  }),
};

describe("RFC 9421 Appendix B.2.6 (Ed25519)", () => {
  const input =
    'sig-b26=("date" "@method" "@path" "@authority" "content-type" "content-length");created=1618884473;keyid="test-key-ed25519"';
  const expected =
    "wqcAqbmYJ2ji2glfAMaRy4gruYYnx2nEFN2HN6jrnDnQCK1u02Gb04v9EDgwUPiu4A0w6vuQv5lIp5WPpBKRCw==";

  it("builds the published signature base", () => {
    const covered = parseDictionary(input).get("sig-b26") as InnerList;
    expect(signatureBase(rfcRequest, covered).base).toBe(
      [
        '"date": Tue, 20 Apr 2021 02:07:55 GMT',
        '"@method": POST',
        '"@path": /foo',
        '"@authority": example.com',
        '"content-type": application/json',
        '"content-length": 18',
        '"@signature-params": ("date" "@method" "@path" "@authority" "content-type" "content-length");created=1618884473;keyid="test-key-ed25519"',
      ].join("\n"),
    );
  });

  it("reproduces the published signature bytes", async () => {
    const key = await crypto.subtle.importKey(
      "pkcs8",
      new Uint8Array(fromBase64(RFC_PRIVATE_PKCS8)),
      { name: "Ed25519" },
      false,
      ["sign"],
    );
    const covered = parseDictionary(input).get("sig-b26") as InnerList;
    const sig = await signBytes(
      key,
      utf8(signatureBase(rfcRequest, covered).base),
    );
    expect(toBase64(sig)).toBe(expected);
  });

  it("verifies the published signature bytes against the JWK public key", async () => {
    const key = await importPublicJwk(RFC_PUBLIC_JWK);
    const covered = parseDictionary(input).get("sig-b26") as InnerList;
    expect(
      await edVerify(
        key,
        fromBase64(expected),
        utf8(signatureBase(rfcRequest, covered).base),
      ),
    ).toBe(true);
  });

  it("rejects the published vector under TAP because it has no expires", async () => {
    const key = await importPublicJwk(RFC_PUBLIC_JWK);
    const result = await verifyRequest(
      {
        ...rfcRequest,
        headers: new Headers([
          ...rfcRequest.headers,
          ["Signature-Input", input],
          ["Signature", `sig-b26=:${expected}:`],
        ]),
      },
      {
        now: 1618884473 + 10,
        resolveKey: async (kid) => (kid === "test-key-ed25519" ? key : null),
        requiredComponents: ["@method", "@path", "@authority"],
        requireNonce: false,
        maxWindowSeconds: 480,
      },
    );
    // Appendix B.2.6 omits `expires` and `nonce`. TAP (SDD §13.3) requires both.
    expect(result).toMatchObject({ ok: false, reason: "missing_expires" });
  });
});

describe("Content-Digest (RFC 9530)", () => {
  it("matches the RFC 9530 sha-256 example", async () => {
    expect(await contentDigest(RFC_BODY)).toBe(
      "sha-256=:X48E9qOokqqrvdts8nOJRJN3OWDUoyWxBf7kbu9DBPE=:",
    );
  });
  it("verifies sha-512 and rejects tampering", async () => {
    const header = rfcRequest.headers.get("content-digest");
    expect(await verifyContentDigest(header, RFC_BODY)).toBe(true);
    expect(await verifyContentDigest(header, '{"hello": "World"}')).toBe(false);
    expect(await verifyContentDigest("md5=:AAAA:", RFC_BODY)).toBe(false);
    expect(await verifyContentDigest(null, RFC_BODY)).toBe(false);
  });
});

describe("TAP sign/verify round trip", async () => {
  const { privateJwk, publicJwk } = await generateEd25519Jwk("pc-agent-test");
  const signing = await signingKeyFromEnv(JSON.stringify(privateJwk));
  const publicKey = await importPublicJwk(publicJwk);
  const resolveKey = async (kid: string) =>
    kid === "pc-agent-test" ? publicKey : null;
  const url = "https://demomart.example/acp/checkout_sessions/cs_1/complete";
  const body = JSON.stringify({ payment_data: { token: "t" } });
  const now = 1_790_000_000;

  async function signed(
    overrides: Partial<Parameters<typeof signRequest>[1]> = {},
  ) {
    const headers = await signRequest(
      { method: "POST", url, headers: {} },
      {
        key: signing,
        body,
        tag: "agent-payer-auth",
        created: now,
        ...overrides,
      },
    );
    return { method: "POST", url, headers: new Headers(headers) };
  }

  it("accepts a valid signature and reports its parameters", async () => {
    const msg = await signed({ nonce: "n-1" });
    expect(msg.headers.get("signature-input")).toBe(
      'sig1=("@method" "@authority" "@path" "content-digest");created=1790000000;expires=1790000300;keyid="pc-agent-test";alg="ed25519";nonce="n-1";tag="agent-payer-auth"',
    );
    const result = await verifyRequest(msg, {
      body,
      resolveKey,
      now: now + 1,
      allowedTags: ["agent-payer-auth"],
    });
    expect(result).toEqual({
      ok: true,
      signature: {
        label: "sig1",
        keyId: "pc-agent-test",
        created: now,
        expires: now + 300,
        nonce: "n-1",
        tag: "agent-payer-auth",
        components: ["@method", "@authority", "@path", "content-digest"],
      },
    });
  });

  it.each([
    ["body tampered", { body: body.replace("t", "x") }, "digest_mismatch"],
    ["expired", { now: now + 301 }, "expired"],
    ["created in the future", { now: now - 60 }, "not_yet_valid"],
    ["wrong tag", { allowedTags: ["agent-browser-auth"] }, "wrong_tag"],
  ] as const)("rejects: %s", async (_name, opts, reason) => {
    const msg = await signed();
    const result = await verifyRequest(msg, {
      body,
      resolveKey,
      now: now + 1,
      ...opts,
    });
    expect(result).toMatchObject({ ok: false, reason });
  });

  it("rejects a different path, method or authority", async () => {
    const msg = await signed();
    for (const changed of [
      { ...msg, url: url.replace("complete", "cancel") },
      { ...msg, method: "PUT" },
      { ...msg, url: url.replace("demomart.example", "evil.example") },
    ]) {
      const result = await verifyRequest(changed, {
        body,
        resolveKey,
        now: now + 1,
      });
      expect(result).toMatchObject({ ok: false, reason: "bad_signature" });
    }
  });

  it("rejects an unknown key, a missing signature and a missing nonce", async () => {
    const msg = await signed();
    expect(
      await verifyRequest(msg, {
        body,
        resolveKey: async () => null,
        now: now + 1,
      }),
    ).toMatchObject({
      ok: false,
      reason: "unknown_key",
      keyId: "pc-agent-test",
    });
    expect(
      await verifyRequest({ method: "GET", url, headers: {} }, { resolveKey }),
    ).toMatchObject({ ok: false, reason: "missing_signature" });
    const input =
      msg.headers.get("signature-input")?.replace(/;nonce="[^"]+"/, "") ?? "";
    msg.headers.set("signature-input", input);
    expect(
      await verifyRequest(msg, { body, resolveKey, now: now + 1 }),
    ).toMatchObject({
      ok: false,
      reason: "missing_nonce",
    });
  });

  it("rejects windows longer than 8 minutes and refuses to sign them", async () => {
    await expect(signed({ ttlSeconds: 481 })).rejects.toThrow(RangeError);
    const msg = await signed();
    const input =
      msg.headers
        .get("signature-input")
        ?.replace("expires=1790000300", "expires=1790000600") ?? "";
    msg.headers.set("signature-input", input);
    expect(
      await verifyRequest(msg, { body, resolveKey, now: now + 1 }),
    ).toMatchObject({
      ok: false,
      reason: "window_too_long",
    });
  });

  it("requires content-digest coverage when there is a body", async () => {
    const headers = await signRequest(
      { method: "GET", url, headers: {} },
      { key: signing, tag: "agent-browser-auth", created: now },
    );
    const result = await verifyRequest(
      { method: "GET", url, headers: new Headers(headers) },
      { body: "smuggled", resolveKey, now: now + 1 },
    );
    expect(result).toMatchObject({
      ok: false,
      reason: "missing_component",
      detail: "content-digest",
    });
  });

  it("rejects malformed headers without throwing", async () => {
    const result = await verifyRequest(
      {
        method: "GET",
        url,
        headers: { "signature-input": "sig1=(", signature: "sig1=:x:" },
      },
      { resolveKey },
    );
    expect(result).toMatchObject({ ok: false, reason: "malformed_signature" });
  });
});

describe("EdDSA JWS", async () => {
  const { privateJwk, publicJwk } = await generateEd25519Jwk("pc-grant-test");
  const key = {
    keyId: "pc-grant-test",
    privateKey: await importPrivateJwk(privateJwk),
  };
  const pub = await importPublicJwk(publicJwk);
  const resolve = async (kid: string) => (kid === "pc-grant-test" ? pub : null);

  it("round-trips and checks the type", async () => {
    const jws = await signJws({ a: 1 }, key, "proofcart-grant+jwt");
    expect(await verifyJws(jws, resolve, "proofcart-grant+jwt")).toMatchObject({
      ok: true,
      payload: { a: 1 },
    });
    expect(await verifyJws(jws, resolve, "other")).toMatchObject({
      ok: false,
      reason: "wrong_type",
    });
  });

  it("rejects a modified payload, alg none and garbage", async () => {
    const jws = await signJws({ amount: 100 }, key);
    const [h, , s] = jws.split(".");
    const forged = `${h}.${btoa(JSON.stringify({ amount: 1_000_000 })).replace(/=+$/, "")}.${s}`;
    expect(await verifyJws(forged, resolve)).toMatchObject({
      ok: false,
      reason: "bad_signature",
    });
    const none = `${btoa(JSON.stringify({ alg: "none", kid: "pc-grant-test" })).replace(/=+$/, "")}.e30.`;
    expect(await verifyJws(none, resolve)).toMatchObject({
      ok: false,
      reason: "unsupported_alg",
    });
    expect(await verifyJws("a.b", resolve)).toMatchObject({
      ok: false,
      reason: "malformed",
    });
  });
});

describe("JwksCache", () => {
  it("caches for the TTL and refetches for an unknown kid at most once per window", async () => {
    const a = await generateEd25519Jwk("a");
    const b = await generateEd25519Jwk("b");
    let served = [a.publicJwk];
    let calls = 0;
    let clock = 0;
    const cache = new JwksCache(
      "https://proofcart.example/.well-known/jwks.json",
      {
        now: () => clock,
        fetch: (async () => {
          calls++;
          return Response.json({ keys: served });
        }) as typeof fetch,
      },
    );
    expect(await cache.getKey("a")).not.toBeNull();
    expect(await cache.getKey("a")).not.toBeNull();
    expect(calls).toBe(1);
    served = [a.publicJwk, b.publicJwk];
    expect(await cache.getKey("b")).toBeNull(); // within the refetch guard
    clock += 31_000;
    expect(await cache.getKey("b")).not.toBeNull(); // rotation picked up
    expect(calls).toBe(2);
    clock += 301_000;
    await cache.getKey("a");
    expect(calls).toBe(3);
  });
});
