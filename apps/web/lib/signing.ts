import "server-only";
import { CatalogError } from "@cartel/catalog/supabase";
import type { AuthenticatorTransportFuture } from "@simplewebauthn/server";
import { allowedOrigins, matchOrigin } from "./signing-origin";
import {
  type SigningConfig,
  type SigningDeps,
  SigningError,
  type SigningStore,
} from "./signing-service";
import { createAdminClient } from "./supabase/admin";
import { createClient } from "./supabase/server";

// Raised by supabase/migrations/0105_signing.sql and the contract state machine.
const DB_CODES = new Set([
  "contract_not_found",
  "contract_not_awaiting_signature",
  "contract_expired",
  "contract_superseded",
  "body_hash_mismatch",
  "challenge_invalid",
  "signing_key_required",
  "credential_not_found",
  "counter_regressed",
]);

function dbError(error: { message?: string; code?: string } | null): never {
  const code = error?.message ?? "";
  if (DB_CODES.has(code))
    throw new SigningError(code, code === "contract_not_found" ? 404 : 409);
  if (error?.code === "23505") throw new SigningError("credential_exists");
  throw new SigningError("signing_storage_failed", 503);
}

const toHex = (bytes: Uint8Array) => `\\x${Buffer.from(bytes).toString("hex")}`;
const fromHex = (value: string) =>
  new Uint8Array(Buffer.from(value.replace(/^\\x/, ""), "hex"));

/** Origins the ceremony accepts; see lib/signing-origin.ts. */
function configuredOrigins(): { rpId: string; origins: string[] } {
  const e = process.env;
  const rpId = e.WEBAUTHN_RP_ID;
  const origins = rpId ? allowedOrigins(e.WEBAUTHN_ORIGIN, rpId) : [];
  if (!rpId || origins.length === 0)
    throw new SigningError("signing_not_configured", 503);
  return { rpId, origins };
}

/** The RP for this request; `origin` is the allowed origin it came from. */
export function signingConfig(origin?: string): SigningConfig {
  const { rpId, origins } = configuredOrigins();
  return {
    rpId,
    rpName: process.env.WEBAUTHN_RP_NAME || "Cartel",
    origin:
      origin && origins.includes(origin) ? origin : (origins[0] as string),
  };
}

/** Refused origin; carries the one to use so the page can say where to sign. */
export class OriginRejected extends SigningError {
  constructor(readonly expected: string) {
    super("origin_rejected", 403);
  }
}

/** Signing routes accept only same-origin browser requests from an allowed origin. */
export function signingOrigin(request: Request): string {
  const { origins } = configuredOrigins();
  const origin = matchOrigin(request.headers.get("origin"), origins);
  if (!origin) throw new OriginRejected(origins[0] as string);
  return origin;
}

export async function signingUser() {
  const client = await createClient();
  if (!client) throw new SigningError("auth_not_configured", 503);
  const { data, error } = await client.auth.getUser();
  if (error || !data.user)
    throw new SigningError("authentication_required", 401);
  return { id: data.user.id, name: data.user.email ?? "Cartel shopper" };
}

export function supabaseSigningStore(): SigningStore {
  const db = createAdminClient();
  return {
    async credentials(userId) {
      const { data, error } = await db
        .from("signing_credentials")
        .select("credential_id,public_key,counter,transports")
        .eq("user_id", userId)
        .order("created_at");
      if (error) dbError(error);
      return data.map((c) => ({
        credentialId: c.credential_id,
        publicKey: fromHex(c.public_key),
        counter: c.counter,
        transports: c.transports as AuthenticatorTransportFuture[],
      }));
    },
    async beginRegistration(userId, challenge) {
      const { error } = await db.rpc("srv_begin_signing_registration", {
        p_user: userId,
        p_challenge: challenge,
      });
      if (error) dbError(error);
    },
    async consumeRegistration(userId, challenge) {
      const { data, error } = await db.rpc("srv_consume_signing_registration", {
        p_user: userId,
        p_challenge: challenge,
      });
      if (error) dbError(error);
      return data === true;
    },
    async addCredential(userId, c) {
      const { error } = await db.from("signing_credentials").insert({
        user_id: userId,
        credential_id: c.credentialId,
        public_key: toHex(c.publicKey),
        counter: c.counter,
        transports: c.transports,
        device_label: c.label,
      });
      if (error) dbError(error);
    },
    async loadVersion(userId, versionId) {
      const { data, error } = await db
        .from("contract_versions")
        // contract_versions reaches plans through contracts (composite FK).
        .select("body,body_hash,contracts!inner(plans!inner(user_id))")
        .eq("id", versionId)
        .eq("contracts.plans.user_id", userId)
        .maybeSingle();
      if (error) dbError(error);
      return data ? { body: data.body, bodyHash: data.body_hash } : null;
    },
    async beginSigning(input) {
      const { data, error } = await db.rpc("srv_begin_signing", {
        p_user: input.userId,
        p_version: input.versionId,
        p_hash: input.bodyHash,
        p_nonce: input.nonce,
        p_challenge: input.challenge,
      });
      if (error) dbError(error);
      return data;
    },
    async consumeChallenge(userId, nonce) {
      const { data, error } = await db.rpc("srv_consume_signing_challenge", {
        p_user: userId,
        p_nonce: nonce,
      });
      if (error) dbError(error);
      const row = data[0];
      return row
        ? {
            contractVersionId: row.contract_version_id,
            bodyHash: row.body_hash,
            challenge: row.challenge,
            expired: row.expired,
          }
        : null;
    },
    async recordSignature(input) {
      const { data, error } = await db.rpc("srv_record_contract_signature", {
        p_user: input.userId,
        p_version: input.versionId,
        p_hash: input.bodyHash,
        p_challenge: input.challenge,
        p_credential: input.credentialId,
        p_authenticator_data: toHex(input.authenticatorData),
        p_client_data_json: toHex(input.clientDataJSON),
        p_signature: toHex(input.signature),
        p_counter: input.counter,
      });
      if (error) dbError(error);
      return data;
    },
  };
}

export function signingDeps(origin?: string): SigningDeps {
  return { config: signingConfig(origin), store: supabaseSigningStore() };
}

export function signingResponse(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

export function signingError(error: unknown) {
  if (error instanceof OriginRejected)
    return signingResponse(
      { error: error.code, expected: error.expected },
      error.status,
    );
  if (error instanceof SigningError || error instanceof CatalogError)
    return signingResponse({ error: error.code }, error.status);
  return signingResponse({ error: "signing_unavailable" }, 503);
}
