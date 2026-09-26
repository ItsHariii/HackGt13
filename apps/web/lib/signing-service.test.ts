import {
  type ContractBody,
  contractHash,
  verifyContractSignature,
} from "@cartel/contracts";
import { FLAGSHIP_CONTRACT_V8, p1363ToDer } from "@cartel/contracts/fixtures";
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";
import {
  isoBase64URL,
  isoCBOR,
  isoUint8Array,
} from "@simplewebauthn/server/helpers";
import { beforeEach, describe, expect, it } from "vitest";
import {
  coseToJwk,
  registrationOptions,
  type SigningDeps,
  SigningError,
  type SigningStore,
  type StoredCredential,
  signingOptions,
  verifyRegistration,
  verifySigning,
} from "./signing-service";

const config = {
  rpId: "cartel.test",
  rpName: "Cartel",
  origin: "https://cartel.test",
};
const ALICE = "11111111-1111-4111-8111-111111111111";
const BOB = "22222222-2222-4222-8222-222222222222";
const VERSION = "c0000000-0000-4000-8000-000000000001";

const utf8 = (s: string) => isoUint8Array.fromUTF8String(s);
const b64 = (b: Uint8Array) =>
  isoBase64URL.fromBuffer(b as Uint8Array<ArrayBuffer>);
const sha256 = async (b: Uint8Array) =>
  new Uint8Array(
    await crypto.subtle.digest("SHA-256", b as Uint8Array<ArrayBuffer>),
  );

/** A software platform authenticator: ES256, user verification, a counter. */
async function authenticator(opts: { userVerified?: boolean } = {}) {
  const pair = (await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  const jwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  const id = crypto.getRandomValues(new Uint8Array(16));
  const coseKey = isoCBOR.encode(
    new Map<number, number | Uint8Array>([
      [1, 2],
      [3, -7],
      [-1, 1],
      [-2, isoBase64URL.toBuffer(jwk.x as string)],
      [-3, isoBase64URL.toBuffer(jwk.y as string)],
    ]),
  );
  let counter = 0;
  const flags = 0x01 | (opts.userVerified === false ? 0 : 0x04);
  async function authData(rpId: string, extra = new Uint8Array()) {
    const out = new Uint8Array(37 + extra.length);
    out.set(await sha256(utf8(rpId)));
    out[32] = flags | (extra.length ? 0x40 : 0);
    new DataView(out.buffer).setUint32(33, ++counter);
    out.set(extra, 37);
    return out;
  }
  const clientData = (type: string, challenge: string, origin: string) =>
    utf8(JSON.stringify({ type, challenge, origin, crossOrigin: false }));
  return {
    id: b64(id),
    async register(
      challenge: string,
      origin = config.origin,
    ): Promise<RegistrationResponseJSON> {
      const attested = new Uint8Array(16 + 2 + id.length + coseKey.length);
      new DataView(attested.buffer).setUint16(16, id.length);
      attested.set(id, 18);
      attested.set(coseKey, 18 + id.length);
      const attestationObject = isoCBOR.encode(
        new Map<string, unknown>([
          ["fmt", "none"],
          ["attStmt", new Map()],
          ["authData", await authData(config.rpId, attested)],
        ]) as Parameters<typeof isoCBOR.encode>[0],
      );
      return {
        id: b64(id),
        rawId: b64(id),
        type: "public-key",
        clientExtensionResults: {},
        response: {
          clientDataJSON: b64(clientData("webauthn.create", challenge, origin)),
          attestationObject: b64(attestationObject),
          transports: ["internal"],
        },
      };
    },
    async sign(
      challenge: string,
      { origin = config.origin, rpId = config.rpId } = {},
    ): Promise<AuthenticationResponseJSON> {
      const data = await authData(rpId);
      const client = clientData("webauthn.get", challenge, origin);
      const signed = new Uint8Array(data.length + 32);
      signed.set(data);
      signed.set(await sha256(client), data.length);
      const raw = new Uint8Array(
        await crypto.subtle.sign(
          { name: "ECDSA", hash: "SHA-256" },
          pair.privateKey,
          signed,
        ),
      );
      return {
        id: b64(id),
        rawId: b64(id),
        type: "public-key",
        clientExtensionResults: {},
        response: {
          clientDataJSON: b64(client),
          authenticatorData: b64(data),
          signature: b64(p1363ToDer(raw)),
        },
      };
    },
  };
}

/** Mirrors supabase/migrations/0105_signing.sql closely enough for the ceremony. */
function memoryStore() {
  const credentials = new Map<string, StoredCredential[]>();
  const registrations = new Map<string, string>();
  const challenges = new Map<
    string,
    {
      userId: string;
      versionId: string;
      bodyHash: string;
      challenge: string;
      expired: boolean;
    }
  >();
  const versions = new Map<
    string,
    { owner: string; body: unknown; bodyHash: string; status: string }
  >();
  const signatures: Parameters<SigningStore["recordSignature"]>[0][] = [];
  const store: SigningStore = {
    credentials: async (u) => credentials.get(u) ?? [],
    beginRegistration: async (u, c) => {
      registrations.set(c, u);
    },
    consumeRegistration: async (u, c) => {
      const owner = registrations.get(c);
      if (owner !== u) return false;
      registrations.delete(c);
      return true;
    },
    addCredential: async (u, c) => {
      credentials.set(u, [...(credentials.get(u) ?? []), c]);
    },
    loadVersion: async (u, id) => {
      const v = versions.get(id);
      return v && v.owner === u ? v : null;
    },
    beginSigning: async (input) => {
      const v = versions.get(input.versionId);
      if (!v || v.owner !== input.userId)
        throw new SigningError("contract_not_found", 404);
      if (v.status !== "awaiting_signature")
        throw new SigningError("contract_not_awaiting_signature");
      challenges.set(input.nonce, { ...input, expired: false });
      return new Date(Date.now() + 120_000).toISOString();
    },
    consumeChallenge: async (u, nonce) => {
      const c = challenges.get(nonce);
      if (!c || c.userId !== u) return null;
      challenges.delete(nonce);
      return { contractVersionId: c.versionId, ...c };
    },
    recordSignature: async (input) => {
      const v = versions.get(input.versionId);
      if (v?.status !== "awaiting_signature" || v.bodyHash !== input.bodyHash)
        throw new SigningError("contract_not_awaiting_signature");
      const c = credentials
        .get(input.userId)
        ?.find((k) => k.credentialId === input.credentialId);
      if (!c) throw new SigningError("credential_not_found");
      c.counter = input.counter;
      v.status = "signed";
      signatures.push(input);
      return `sig-${signatures.length}`;
    },
  };
  return { store, versions, challenges, signatures };
}

type Authenticator = Awaited<ReturnType<typeof authenticator>>;

async function contractFor(user: string): Promise<ContractBody> {
  return { ...FLAGSHIP_CONTRACT_V8, subject: `user:${user}` };
}
const challengeOf = (options: { challenge: string }) =>
  isoUint8Array.toUTF8String(isoBase64URL.toBuffer(options.challenge));

describe("passkey signing ceremony (T12.1–T12.5)", () => {
  let mem: ReturnType<typeof memoryStore>;
  let deps: SigningDeps;
  let alice: Authenticator;
  let bob: Authenticator;

  async function enroll(user: string, auth: Authenticator) {
    const options = await registrationOptions(deps, { id: user, name: user });
    return verifyRegistration(
      deps,
      user,
      await auth.register(options.challenge),
      null,
    );
  }

  beforeEach(async () => {
    mem = memoryStore();
    deps = { config, store: mem.store };
    const body = await contractFor(ALICE);
    mem.versions.set(VERSION, {
      owner: ALICE,
      body,
      bodyHash: await contractHash(body),
      status: "awaiting_signature",
    });
    alice = await authenticator();
    bob = await authenticator();
    await enroll(ALICE, alice);
    await enroll(BOB, bob);
  });

  it("registers with required user verification and a preferred resident key", async () => {
    const options = await registrationOptions(deps, {
      id: ALICE,
      name: "alice@example.com",
    });
    expect(options.authenticatorSelection).toMatchObject({
      userVerification: "required",
      residentKey: "preferred",
    });
    expect(options.excludeCredentials?.map((c) => c.id)).toEqual([alice.id]);
    const [stored] = await mem.store.credentials(ALICE);
    expect(coseToJwk(stored?.publicKey as Uint8Array)).toMatchObject({
      kty: "EC",
      crv: "P-256",
    });
  });

  it("rejects a reused registration challenge and one without user verification", async () => {
    const options = await registrationOptions(deps, { id: ALICE, name: "a" });
    const other = await authenticator();
    await verifyRegistration(
      deps,
      ALICE,
      await other.register(options.challenge),
      null,
    );
    const again = await authenticator();
    await expect(
      verifyRegistration(
        deps,
        ALICE,
        await again.register(options.challenge),
        null,
      ),
    ).rejects.toMatchObject({ code: "challenge_invalid" });

    const next = await registrationOptions(deps, { id: ALICE, name: "a" });
    const noUv = await authenticator({ userVerified: false });
    await expect(
      verifyRegistration(
        deps,
        ALICE,
        await noUv.register(next.challenge),
        null,
      ),
    ).rejects.toMatchObject({ code: "registration_invalid" });
  });

  it("signs the challenge ct1:{H}:{N} and records an offline-verifiable signature", async () => {
    const { options, bodyHash } = await signingOptions(deps, ALICE, VERSION);
    const challenge = challengeOf(options);
    expect(challenge).toMatch(
      new RegExp(`^ct1:${bodyHash.slice(7)}:[A-Za-z0-9_-]{24}$`),
    );
    expect(options.userVerification).toBe("required");
    expect(options.allowCredentials?.map((c) => c.id)).toEqual([alice.id]);

    const response = await alice.sign(options.challenge);
    const result = await verifySigning(deps, ALICE, response);
    expect(result).toEqual({
      signatureId: "sig-1",
      contractVersionId: VERSION,
      bodyHash,
    });
    expect(mem.versions.get(VERSION)?.status).toBe("signed");
    expect(mem.challenges.size).toBe(0);

    const [cred] = await mem.store.credentials(ALICE);
    const offline = await verifyContractSignature(
      {
        bodyHash,
        credentialId: alice.id,
        authenticatorData: response.response.authenticatorData,
        clientDataJSON: response.response.clientDataJSON,
        signature: response.response.signature,
        publicKeyJwk: coseToJwk(cred?.publicKey as Uint8Array),
        signedAt: new Date().toISOString(),
      },
      { bodyHash, expectedOrigin: config.origin, expectedRpId: config.rpId },
    );
    expect(offline.ok).toBe(true);
  });

  it("✅ a tampered body → the hash mismatches → verification fails", async () => {
    const { options } = await signingOptions(deps, ALICE, VERSION);
    const response = await alice.sign(options.challenge);
    const v = mem.versions.get(VERSION);
    if (!v) throw new Error("fixture");
    v.body = {
      ...(v.body as ContractBody),
      economics: {
        ...(v.body as ContractBody).economics,
        maxTotalMinor: 999_999,
      },
    };
    await expect(verifySigning(deps, ALICE, response)).rejects.toMatchObject({
      code: "body_hash_mismatch",
    });
    expect(mem.signatures).toHaveLength(0);
  });

  it("✅ an assertion over a different hash → fails", async () => {
    const { options } = await signingOptions(deps, ALICE, VERSION);
    const [, , nonce] = challengeOf(options).split(":");
    const forged = `ct1:${"0".repeat(64)}:${nonce}`;
    await expect(
      verifySigning(
        deps,
        ALICE,
        await alice.sign(isoBase64URL.fromUTF8String(forged)),
      ),
    ).rejects.toMatchObject({ code: "challenge_invalid" });
    expect(mem.signatures).toHaveLength(0);
  });

  it("✅ a reused challenge → fails", async () => {
    const { options } = await signingOptions(deps, ALICE, VERSION);
    const response = await alice.sign(options.challenge);
    await verifySigning(deps, ALICE, response);
    await expect(verifySigning(deps, ALICE, response)).rejects.toMatchObject({
      code: "challenge_invalid",
    });
    expect(mem.signatures).toHaveLength(1);
  });

  it("✅ a wrong origin → fails, and the challenge is spent", async () => {
    const { options } = await signingOptions(deps, ALICE, VERSION);
    await expect(
      verifySigning(
        deps,
        ALICE,
        await alice.sign(options.challenge, { origin: "https://evil.test" }),
      ),
    ).rejects.toMatchObject({ code: "assertion_invalid" });
    await expect(
      verifySigning(deps, ALICE, await alice.sign(options.challenge)),
    ).rejects.toMatchObject({ code: "challenge_invalid" });
    expect(mem.signatures).toHaveLength(0);
  });

  it("✅ a wrong RP ID → fails", async () => {
    const { options } = await signingOptions(deps, ALICE, VERSION);
    await expect(
      verifySigning(
        deps,
        ALICE,
        await alice.sign(options.challenge, { rpId: "evil.test" }),
      ),
    ).rejects.toMatchObject({ code: "assertion_invalid" });
  });

  it("✅ an expired challenge → fails", async () => {
    const { options } = await signingOptions(deps, ALICE, VERSION);
    for (const c of mem.challenges.values()) c.expired = true;
    await expect(
      verifySigning(deps, ALICE, await alice.sign(options.challenge)),
    ).rejects.toMatchObject({ code: "challenge_expired" });
    expect(mem.challenges.size).toBe(0);
    expect(mem.signatures).toHaveLength(0);
  });

  it("✅ another user's credential → fails", async () => {
    const { options } = await signingOptions(deps, ALICE, VERSION);
    await expect(
      verifySigning(deps, ALICE, await bob.sign(options.challenge)),
    ).rejects.toMatchObject({ code: "credential_not_found" });
    expect(mem.signatures).toHaveLength(0);
  });

  it("another user cannot request or redeem the challenge", async () => {
    await expect(signingOptions(deps, BOB, VERSION)).rejects.toMatchObject({
      code: "contract_not_found",
    });
    const { options } = await signingOptions(deps, ALICE, VERSION);
    await expect(
      verifySigning(deps, BOB, await bob.sign(options.challenge)),
    ).rejects.toMatchObject({ code: "challenge_invalid" });
  });

  it("a forged signature → fails", async () => {
    const { options } = await signingOptions(deps, ALICE, VERSION);
    const response = await alice.sign(options.challenge);
    const bad = isoBase64URL.toBuffer(response.response.signature);
    bad[bad.length - 1] = (bad[bad.length - 1] ?? 0) ^ 1;
    response.response.signature = b64(bad);
    await expect(verifySigning(deps, ALICE, response)).rejects.toMatchObject({
      code: "assertion_invalid",
    });
  });

  it("requires a signing key before issuing a challenge", async () => {
    const body = await contractFor("33333333-3333-4333-8333-333333333333");
    mem.versions.set("v-carol", {
      owner: "33333333-3333-4333-8333-333333333333",
      body,
      bodyHash: await contractHash(body),
      status: "awaiting_signature",
    });
    await expect(
      signingOptions(deps, "33333333-3333-4333-8333-333333333333", "v-carol"),
    ).rejects.toMatchObject({ code: "signing_key_required" });
  });
});
