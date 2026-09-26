// T8.1 acceptance: signing and verifying round-trips for arbitrary requests, and
// any change to what the signature covers is rejected. Runs on both backends so
// the @noble/curves fallback is held to the same behavior as Web Crypto.

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { fromBase64Url, toBase64Url, utf8 } from "./base64";
import {
  type Ed25519PublicKey,
  ed25519Backend,
  nobleKey,
  noblePublicKeyOf,
  nobleRandomPrivateKey,
} from "./ed25519";
import {
  generateEd25519Jwk,
  importPrivateJwk,
  importPublicJwk,
  type SigningKey,
} from "./keys";
import {
  signRequest,
  TAP_MAX_WINDOW_S,
  type TapTag,
  verifyRequest,
} from "./rfc9421";

const KEY_ID = "pc-agent-property";
const hasWebCrypto = (await ed25519Backend()) === "webcrypto";

interface Target {
  method: string;
  authority: string;
  path: string;
  query: string;
  body: string | undefined;
}

interface Signed extends Target {
  tag: TapTag;
  created: number;
  ttlSeconds: number;
  nonce: string;
}

const signed: fc.Arbitrary<Signed> = fc.record({
  method: fc.constantFrom("GET", "POST", "PUT", "DELETE"),
  authority: fc.constantFrom(
    "demomart.example",
    "demomart.example:8443",
    "shop.demomart.example",
  ),
  path: fc.webPath(),
  query: fc.constantFrom("", "?sku=U2727", "?a=1&b=two%20words"),
  body: fc.option(fc.string({ maxLength: 512 }), { nil: undefined }),
  tag: fc.constantFrom<TapTag>("agent-browser-auth", "agent-payer-auth"),
  created: fc.integer({ min: 1_600_000_000, max: 2_000_000_000 }),
  ttlSeconds: fc.integer({ min: 1, max: TAP_MAX_WINDOW_S }),
  nonce: fc
    .string({ minLength: 1, maxLength: 32 })
    .map((s) => toBase64Url(utf8(s))),
});

function urlOf(t: Target): string {
  return `https://${t.authority}${t.path.startsWith("/") ? t.path : `/${t.path}`}${t.query}`;
}

async function sign(r: Signed, key: SigningKey) {
  const url = urlOf(r);
  const headers = await signRequest(
    { method: r.method, url, headers: {} },
    {
      key,
      tag: r.tag,
      created: r.created,
      ttlSeconds: r.ttlSeconds,
      nonce: r.nonce,
      ...(r.body !== undefined ? { body: r.body } : {}),
    },
  );
  return { method: r.method, url, headers: new Headers(headers) };
}

/** A key pair held by the named backend, from the same JWK either way. */
async function keyPair(
  backend: "webcrypto" | "noble",
): Promise<{ signing: SigningKey; publicKey: Ed25519PublicKey }> {
  if (backend === "noble") {
    const d = nobleRandomPrivateKey();
    return {
      signing: { keyId: KEY_ID, privateKey: nobleKey("private", d) },
      publicKey: nobleKey("public", noblePublicKeyOf(d)),
    };
  }
  const { privateJwk, publicJwk } = await generateEd25519Jwk(KEY_ID);
  return {
    signing: { keyId: KEY_ID, privateKey: await importPrivateJwk(privateJwk) },
    publicKey: await importPublicJwk(publicJwk),
  };
}

describe.each(["webcrypto", "noble"] as const)("round trip (%s)", (backend) => {
  const skip = backend === "webcrypto" && !hasWebCrypto;

  it.skipIf(skip)("accepts every signature it produced", async () => {
    const { signing, publicKey } = await keyPair(backend);
    await fc.assert(
      fc.asyncProperty(signed, async (r) => {
        const msg = await sign(r, signing);
        expect(
          await verifyRequest(msg, {
            ...(r.body !== undefined ? { body: r.body } : {}),
            resolveKey: async (kid) => (kid === KEY_ID ? publicKey : null),
            now: r.created,
            allowedTags: [r.tag],
          }),
        ).toMatchObject({
          ok: true,
          signature: {
            keyId: KEY_ID,
            created: r.created,
            expires: r.created + r.ttlSeconds,
            nonce: r.nonce,
            tag: r.tag,
          },
        });
      }),
      { numRuns: 100 },
    );
  });

  it.skipIf(skip)(
    "rejects a changed method, authority, path or body",
    async () => {
      const { signing, publicKey } = await keyPair(backend);
      await fc.assert(
        fc.asyncProperty(
          signed,
          fc.constantFrom("method", "authority", "path", "body" as const),
          async (r, field) => {
            const msg = await sign(r, signing);
            const changed: Target = {
              ...r,
              ...(field === "method"
                ? { method: r.method === "GET" ? "POST" : "GET" }
                : {}),
              ...(field === "authority"
                ? { authority: `evil.${r.authority}` }
                : {}),
              ...(field === "path" ? { path: `${r.path}/extra` } : {}),
              ...(field === "body" ? { body: `${r.body ?? ""}x` } : {}),
            };
            expect(
              (
                await verifyRequest(
                  {
                    method: changed.method,
                    url: urlOf(changed),
                    headers: msg.headers,
                  },
                  {
                    ...(changed.body !== undefined
                      ? { body: changed.body }
                      : {}),
                    resolveKey: async () => publicKey,
                    now: r.created,
                  },
                )
              ).ok,
            ).toBe(false);
          },
        ),
        { numRuns: 100 },
      );
    },
  );
});

describe.skipIf(!hasWebCrypto)("backend parity", () => {
  it("cross-verifies Web Crypto and @noble/curves signatures", async () => {
    const { privateJwk, publicJwk } = await generateEd25519Jwk(KEY_ID);
    const web: { signing: SigningKey; publicKey: Ed25519PublicKey } = {
      signing: {
        keyId: KEY_ID,
        privateKey: await importPrivateJwk(privateJwk),
      },
      publicKey: await importPublicJwk(publicJwk),
    };
    const noble = {
      signing: {
        keyId: KEY_ID,
        privateKey: nobleKey("private", fromBase64Url(privateJwk.d)),
      },
      publicKey: nobleKey("public", fromBase64Url(publicJwk.x)),
    };
    const body = '{"payment_data":{"token":"t"}}';
    const request: Signed = {
      method: "POST",
      authority: "demomart.example",
      path: "/acp/checkout_sessions/cs_1/complete",
      query: "",
      body,
      tag: "agent-payer-auth",
      created: 1_790_000_000,
      ttlSeconds: 300,
      nonce: "n-parity",
    };

    for (const [signing, publicKey] of [
      [web.signing, noble.publicKey],
      [noble.signing, web.publicKey],
    ] as const) {
      const msg = await sign(request, signing);
      expect(
        await verifyRequest(msg, {
          body,
          resolveKey: async () => publicKey,
          now: request.created,
        }),
      ).toMatchObject({ ok: true });
    }
  });
});
