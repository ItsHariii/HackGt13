import {
  ContractBody,
  type ContractSignature,
  contractHash,
  type Hash,
  signingChallenge,
  verifyContractSignature,
} from "@cartel/contracts";
import {
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
  generateAuthenticationOptions,
  generateRegistrationOptions,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import {
  cose,
  decodeCredentialPublicKey,
  isoBase64URL,
  isoUint8Array,
} from "@simplewebauthn/server/helpers";

/**
 * The passkey signing ceremony (SDD §12.2, T12.1–T12.3). Framework-free so the
 * security tests drive it with a software authenticator and an in-memory store;
 * `signing.ts` binds it to Supabase.
 */

export class SigningError extends Error {
  constructor(
    readonly code: string,
    readonly status = 409,
  ) {
    super(code);
  }
}

export interface SigningConfig {
  rpId: string;
  rpName: string;
  origin: string;
}
export interface StoredCredential {
  credentialId: string;
  publicKey: Uint8Array;
  counter: number;
  transports: AuthenticatorTransportFuture[];
}
export interface ConsumedChallenge {
  contractVersionId: string;
  bodyHash: string;
  challenge: string;
  expired: boolean;
}
export interface SigningStore {
  credentials(userId: string): Promise<StoredCredential[]>;
  beginRegistration(userId: string, challenge: string): Promise<void>;
  /** Deletes the challenge; true only when it was this user's and still fresh. */
  consumeRegistration(userId: string, challenge: string): Promise<boolean>;
  addCredential(
    userId: string,
    credential: StoredCredential & { label: string | null },
  ): Promise<void>;
  loadVersion(
    userId: string,
    versionId: string,
  ): Promise<{ body: unknown; bodyHash: string } | null>;
  /** Re-checks state, freshness and hash; stores the 2-minute challenge. */
  beginSigning(input: {
    userId: string;
    versionId: string;
    bodyHash: Hash;
    nonce: string;
    challenge: string;
  }): Promise<string>;
  /** Deletes the challenge before any verification (replay defense). */
  consumeChallenge(
    userId: string,
    nonce: string,
  ): Promise<ConsumedChallenge | null>;
  /** One transaction: signature, counter, `signed`, ledger `contract.signed`. */
  recordSignature(input: {
    userId: string;
    versionId: string;
    bodyHash: string;
    challenge: string;
    credentialId: string;
    authenticatorData: Uint8Array;
    clientDataJSON: Uint8Array;
    signature: Uint8Array;
    counter: number;
  }): Promise<string>;
}
export interface SigningDeps {
  config: SigningConfig;
  store: SigningStore;
}

const CHALLENGE_TIMEOUT_MS = 120_000;
const CHALLENGE = /^ct1:([0-9a-f]{64}):([A-Za-z0-9_-]{16,128})$/;

function decodeChallenge(clientDataJSON: string): string {
  try {
    const clientData = JSON.parse(
      isoUint8Array.toUTF8String(isoBase64URL.toBuffer(clientDataJSON)),
    ) as { challenge?: unknown };
    if (
      typeof clientData.challenge !== "string" ||
      !isoBase64URL.isBase64URL(clientData.challenge)
    )
      throw new Error("challenge");
    return clientData.challenge;
  } catch {
    throw new SigningError("assertion_malformed", 400);
  }
}

/** COSE public key → JWK, the form the offline verifier and Evidence Pack use. */
export function coseToJwk(publicKey: Uint8Array): Record<string, unknown> {
  const key = decodeCredentialPublicKey(publicKey as Uint8Array<ArrayBuffer>);
  const b64 = (v: Uint8Array | undefined) => {
    if (!v) throw new SigningError("unsupported_key", 400);
    return isoBase64URL.fromBuffer(v as Uint8Array<ArrayBuffer>);
  };
  if (cose.isCOSEPublicKeyEC2(key) && key.get(cose.COSEKEYS.crv) === 1)
    return {
      kty: "EC",
      crv: "P-256",
      x: b64(key.get(cose.COSEKEYS.x)),
      y: b64(key.get(cose.COSEKEYS.y)),
    };
  if (cose.isCOSEPublicKeyOKP(key) && key.get(cose.COSEKEYS.crv) === 6)
    return { kty: "OKP", crv: "Ed25519", x: b64(key.get(cose.COSEKEYS.x)) };
  if (cose.isCOSEPublicKeyRSA(key))
    return {
      kty: "RSA",
      n: b64(key.get(cose.COSEKEYS.n)),
      e: b64(key.get(cose.COSEKEYS.e)),
    };
  throw new SigningError("unsupported_key", 400);
}

/** T12.1: options for registering the signing passkey (Settings → Signing key). */
export async function registrationOptions(
  { config, store }: SigningDeps,
  user: { id: string; name: string },
): Promise<PublicKeyCredentialCreationOptionsJSON> {
  const existing = await store.credentials(user.id);
  const options = await generateRegistrationOptions({
    rpName: config.rpName,
    rpID: config.rpId,
    userName: user.name,
    userDisplayName: user.name,
    userID: isoUint8Array.fromUTF8String(user.id),
    attestationType: "none",
    timeout: CHALLENGE_TIMEOUT_MS,
    excludeCredentials: existing.map((c) => ({
      id: c.credentialId,
      transports: c.transports,
    })),
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "required",
    },
    // ES256, EdDSA, RS256: the algorithms the offline verifier supports.
    supportedAlgorithmIDs: [-7, -8, -257],
  });
  await store.beginRegistration(user.id, options.challenge);
  return options;
}

/** T12.1: verify the attestation and store the credential. */
export async function verifyRegistration(
  { config, store }: SigningDeps,
  userId: string,
  response: RegistrationResponseJSON,
  label: string | null,
): Promise<{ credentialId: string }> {
  const challenge = decodeChallenge(response.response?.clientDataJSON);
  if (!(await store.consumeRegistration(userId, challenge)))
    throw new SigningError("challenge_invalid");
  let verified: Awaited<ReturnType<typeof verifyRegistrationResponse>>;
  try {
    verified = await verifyRegistrationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: config.origin,
      expectedRPID: config.rpId,
      requireUserVerification: true,
    });
  } catch {
    throw new SigningError("registration_invalid", 400);
  }
  if (!verified.verified) throw new SigningError("registration_invalid", 400);
  const { credential } = verified.registrationInfo;
  coseToJwk(credential.publicKey);
  await store.addCredential(userId, {
    credentialId: credential.id,
    publicKey: credential.publicKey,
    counter: credential.counter,
    transports: response.response.transports ?? [],
    label,
  });
  return { credentialId: credential.id };
}

async function loadHashed(store: SigningStore, userId: string, id: string) {
  const version = await store.loadVersion(userId, id);
  if (!version) throw new SigningError("contract_not_found", 404);
  const parsed = ContractBody.safeParse(version.body);
  if (!parsed.success || parsed.data.subject !== `user:${userId}`)
    throw new SigningError("contract_linkage_invalid");
  const bodyHash = await contractHash(parsed.data);
  if (bodyHash !== version.bodyHash)
    throw new SigningError("body_hash_mismatch");
  return bodyHash;
}

/** T12.2: the challenge is `ct1:{H}:{N}`, so the passkey signs this exact body. */
export async function signingOptions(
  { config, store }: SigningDeps,
  userId: string,
  versionId: string,
): Promise<{
  options: PublicKeyCredentialRequestOptionsJSON;
  bodyHash: Hash;
  expiresAt: string;
}> {
  const bodyHash = await loadHashed(store, userId, versionId);
  const credentials = await store.credentials(userId);
  if (credentials.length === 0) throw new SigningError("signing_key_required");
  const nonce = isoBase64URL.fromBuffer(
    crypto.getRandomValues(new Uint8Array(18)),
  );
  const challenge = signingChallenge(bodyHash, nonce);
  const expiresAt = await store.beginSigning({
    userId,
    versionId,
    bodyHash,
    nonce,
    challenge,
  });
  const options = await generateAuthenticationOptions({
    rpID: config.rpId,
    challenge,
    timeout: CHALLENGE_TIMEOUT_MS,
    userVerification: "required",
    allowCredentials: credentials.map((c) => ({
      id: c.credentialId,
      transports: c.transports,
    })),
  });
  return { options, bodyHash, expiresAt };
}

/** T12.3: verify the assertion over the challenge, then record it atomically. */
export async function verifySigning(
  { config, store }: SigningDeps,
  userId: string,
  response: AuthenticationResponseJSON,
): Promise<{ signatureId: string; contractVersionId: string; bodyHash: Hash }> {
  const encoded = decodeChallenge(response.response?.clientDataJSON);
  const challenge = isoUint8Array.toUTF8String(isoBase64URL.toBuffer(encoded));
  const match = CHALLENGE.exec(challenge);
  if (!match) throw new SigningError("challenge_invalid");
  const consumed = await store.consumeChallenge(userId, match[2] as string);
  if (!consumed) throw new SigningError("challenge_invalid");
  if (consumed.expired) throw new SigningError("challenge_expired");
  if (consumed.challenge !== challenge)
    throw new SigningError("challenge_invalid");

  const bodyHash = await loadHashed(store, userId, consumed.contractVersionId);
  if (bodyHash !== consumed.bodyHash)
    throw new SigningError("body_hash_mismatch");

  const credential = (await store.credentials(userId)).find(
    (c) => c.credentialId === response.id,
  );
  if (!credential) throw new SigningError("credential_not_found");

  let newCounter: number;
  try {
    const result = await verifyAuthenticationResponse({
      response,
      expectedChallenge: isoBase64URL.fromUTF8String(challenge),
      expectedOrigin: config.origin,
      expectedRPID: config.rpId,
      requireUserVerification: true,
      credential: {
        id: credential.credentialId,
        publicKey: credential.publicKey as Uint8Array<ArrayBuffer>,
        counter: credential.counter,
        transports: credential.transports,
      },
    });
    if (!result.verified) throw new Error("unverified");
    newCounter = result.authenticationInfo.newCounter;
  } catch {
    throw new SigningError("assertion_invalid");
  }

  // What is stored must re-verify offline with the Evidence Pack's verifier.
  const stored: ContractSignature = {
    bodyHash,
    credentialId: credential.credentialId,
    authenticatorData: response.response.authenticatorData,
    clientDataJSON: response.response.clientDataJSON,
    signature: response.response.signature,
    publicKeyJwk: coseToJwk(credential.publicKey),
    signedAt: new Date().toISOString(),
  };
  const offline = await verifyContractSignature(stored, {
    bodyHash,
    expectedOrigin: config.origin,
    expectedRpId: config.rpId,
  });
  if (!offline.ok) throw new SigningError("assertion_invalid");

  const signatureId = await store.recordSignature({
    userId,
    versionId: consumed.contractVersionId,
    bodyHash,
    challenge,
    credentialId: credential.credentialId,
    authenticatorData: isoBase64URL.toBuffer(
      response.response.authenticatorData,
    ),
    clientDataJSON: isoBase64URL.toBuffer(response.response.clientDataJSON),
    signature: isoBase64URL.toBuffer(response.response.signature),
    counter: newCounter,
  });
  return {
    signatureId,
    contractVersionId: consumed.contractVersionId,
    bodyHash,
  };
}
