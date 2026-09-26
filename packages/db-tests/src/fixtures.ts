import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import type { Database } from "@proofcart/contracts/db";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type Db = SupabaseClient<Database>;

type LocalSupabase = { url: string; publishableKey: string; secretKey: string };

/**
 * Connection details for the local stack: from SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY /
 * SUPABASE_SECRET_KEY when set, otherwise from `supabase status`. These tests create and delete
 * users, so anything other than a loopback URL is refused.
 */
function localSupabase(): LocalSupabase {
  const env = process.env;
  let local: LocalSupabase;
  if (
    env.SUPABASE_URL &&
    env.SUPABASE_PUBLISHABLE_KEY &&
    env.SUPABASE_SECRET_KEY
  ) {
    local = {
      url: env.SUPABASE_URL,
      publishableKey: env.SUPABASE_PUBLISHABLE_KEY,
      secretKey: env.SUPABASE_SECRET_KEY,
    };
  } else {
    const bin = fileURLToPath(
      new URL("../../../node_modules/.bin/supabase", import.meta.url),
    );
    let out: string;
    try {
      out = execFileSync(bin, ["status", "--output", "json"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch {
      throw new Error(
        "Local Supabase is not running. Start it with `pnpm db:start`.",
      );
    }
    const status = JSON.parse(out.slice(out.indexOf("{"))) as Record<
      string,
      string
    >;
    local = {
      url: status.API_URL ?? "",
      publishableKey: status.PUBLISHABLE_KEY ?? "",
      secretKey: status.SECRET_KEY ?? "",
    };
  }
  const host = new URL(local.url).hostname;
  if (host !== "127.0.0.1" && host !== "localhost") {
    throw new Error(
      `DB integration tests only run against local Supabase, not ${host}.`,
    );
  }
  return local;
}

const local = localSupabase();
const options = { auth: { persistSession: false, autoRefreshToken: false } };

/** The server's view: secret key, bypasses RLS, may call srv_* wrappers. */
export const admin: Db = createClient<Database>(
  local.url,
  local.secretKey,
  options,
);

/** A signed-out visitor. */
export function anonClient(): Db {
  return createClient<Database>(local.url, local.publishableKey, options);
}

/**
 * Untyped clients pointed at the demomart schema. ProofCart's generated types deliberately
 * exclude it, so these exist only to prove who can and cannot reach it.
 */
export function demomartClient(key: "secret" | "publishable") {
  return createClient(
    local.url,
    key === "secret" ? local.secretKey : local.publishableKey,
    { ...options, db: { schema: "demomart" } },
  );
}

export type TestUser = { id: string; client: Db };

/** An anonymous session, the way a first-time ProofCart visitor starts. */
export async function createUser(): Promise<TestUser> {
  const client = anonClient();
  const { data, error } = await client.auth.signInAnonymously();
  if (error || !data.user || !data.session)
    throw error ?? new Error("no session");
  await client.realtime.setAuth(data.session.access_token);
  return { id: data.user.id, client };
}

export async function deleteUsers(users: TestUser[]): Promise<void> {
  for (const user of users) {
    await user.client.removeAllChannels();
    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) throw error;
  }
}

export function sha256(text: string): string {
  return `sha256:${createHash("sha256").update(text).digest("hex")}`;
}

/** Throws with the Postgres message (e.g. `contract_not_signed`) when a call fails. */
export function must<T>(result: {
  data: T;
  error: { message: string } | null;
}): NonNullable<T> {
  if (result.error) throw new Error(result.error.message);
  if (result.data === null || result.data === undefined)
    throw new Error("no data");
  return result.data as NonNullable<T>;
}

export async function createPlan(
  user: TestUser,
  title = "Home office",
): Promise<string> {
  const plan = must(
    await user.client
      .from("plans")
      .insert({ user_id: user.id, title })
      .select("id")
      .single(),
  );
  return plan.id;
}

/**
 * A contract version signed by `user`, the way the signing ceremony leaves it: a verified
 * signature over the body hash, then the transition through the guard. maxTotal is $910.00.
 */
export async function signedContract(
  user: TestUser,
  planId: string,
): Promise<string> {
  const contractId = randomUUID();
  const versionId = randomUUID();
  const body = {
    schema: "proofcart.contract/1",
    contractId,
    version: 1,
    economics: { currency: "USD", maxTotalMinor: 91_000 },
    merchants: [{ id: "demomart" }],
  };
  const bodyHash = sha256(JSON.stringify(body));
  must(
    await admin
      .from("contracts")
      .insert({ id: contractId, plan_id: planId })
      .select("id")
      .single(),
  );
  must(
    await admin
      .from("contract_versions")
      .insert({
        id: versionId,
        contract_id: contractId,
        plan_id: planId,
        version: 1,
        body,
        body_hash: bodyHash,
        status: "awaiting_signature",
        autonomy: { preset: "balanced" },
        expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
      })
      .select("id")
      .single(),
  );
  const credential = must(
    await admin
      .from("signing_credentials")
      .insert({
        user_id: user.id,
        credential_id: `cred-${randomUUID()}`,
        public_key: "\\x01",
      })
      .select("id")
      .single(),
  );
  must(
    await admin
      .from("contract_signatures")
      .insert({
        contract_version_id: versionId,
        credential_id: credential.id,
        credential_public_key: "\\x01",
        body_hash: bodyHash,
        challenge: `pc1:${bodyHash}:${randomUUID()}`,
        authenticator_data: "\\x02",
        client_data_json: "\\x03",
        signature: "\\x04",
        verified_at: new Date().toISOString(),
      })
      .select("id")
      .single(),
  );
  must(
    await admin.rpc("srv_transition_contract", {
      p_version: versionId,
      p_to: "signed",
      p_actor: `user:${user.id}`,
      p_event: "contract.signed",
    }),
  );
  return versionId;
}

export async function consentDiff(
  versionId: string,
  classification: Database["public"]["Enums"]["diff_classification"],
  totalMinor: number,
): Promise<string> {
  const diff = must(
    await admin
      .from("consent_diffs")
      .insert({
        contract_version_id: versionId,
        classification,
        current_total_minor: totalMinor,
      })
      .select("id")
      .single(),
  );
  return diff.id;
}
