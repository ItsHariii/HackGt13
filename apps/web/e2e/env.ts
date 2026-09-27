import { execFileSync } from "node:child_process";
import { generateKeyPairSync, randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";

/*
 * Environment for the end-to-end suite (TASKS T16.6): both apps against the
 * LOCAL Supabase (`pnpm db:start`), fresh signing keys per run, the
 * Simulated payment rail and the AI off, so every run is deterministic and
 * nothing leaves the machine. The browser uses localhost (WebAuthn does not
 * accept an IP address as the relying party).
 */

export const WEB_PORT = 3200;
export const GREATHUB_PORT = 3201;
export const WEB = `http://localhost:${WEB_PORT}`;
export const GREATHUB = `http://localhost:${GREATHUB_PORT}`;

const root = fileURLToPath(new URL("../../../", import.meta.url));

function localSupabase() {
  const raw = execFileSync(
    `${root}node_modules/.bin/supabase`,
    ["status", "--output", "json"],
    { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  const s = JSON.parse(raw.slice(raw.indexOf("{"))) as Record<string, string>;
  const host = new URL(s.API_URL ?? "").hostname;
  if (!["127.0.0.1", "localhost"].includes(host))
    throw new Error("E2E runs against the local Supabase only");
  return {
    url: s.API_URL as string,
    publishable: s.PUBLISHABLE_KEY as string,
    secret: s.SECRET_KEY as string,
  };
}

function jwk(kid: string): string {
  const { privateKey } = generateKeyPairSync("ed25519");
  return JSON.stringify({ ...privateKey.export({ format: "jwk" }), kid });
}

const secret = () => randomBytes(24).toString("hex");

export function e2eEnv() {
  // Computed once per run and shared with the tests through process.env.
  if (process.env.E2E_READY === "1")
    return process.env as Record<string, string>;
  const db = localSupabase();
  const shared = {
    NEXT_PUBLIC_SUPABASE_URL: db.url,
    SUPABASE_SECRET_KEY: db.secret,
    PAYMENT_RAIL: "simulated",
    GREATHUB_WEBHOOK_SECRET: secret(),
    ADMIN_TOKEN: secret(),
    SENTRY_DSN: "",
    NEXT_PUBLIC_SENTRY_DSN: "",
    SENTRY_AUTH_TOKEN: "",
    NEXT_TELEMETRY_DISABLED: "1",
  };
  const env = {
    ...shared,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: db.publishable,
    AI_ENABLED: "false",
    SOURCES_ENABLED: "greathub",
    WEBAUTHN_RP_ID: "localhost",
    WEBAUTHN_RP_NAME: "Cartel (E2E)",
    WEBAUTHN_ORIGIN: WEB,
    CARTEL_BASE_URL: WEB,
    GREATHUB_BASE_URL: GREATHUB,
    AGENT_SIGNING_JWK: jwk("ct-agent-e2e"),
    AGENT_KEY_ID: "ct-agent-e2e",
    GRANT_SIGNING_JWK: jwk("ct-grant-e2e"),
    GRANT_KEY_ID: "ct-grant-e2e",
    INTERNAL_QUEUE_HMAC_SECRET: secret(),
    CHAOS_ADMIN_TOKEN: secret(),
    GREATHUB_PUBLIC_ORIGIN: GREATHUB,
    CARTEL_JWKS_URL: `${WEB}/.well-known/jwks.json`,
    CARTEL_WEBHOOK_URL: `${WEB}/api/webhooks/greathub`,
    CARTEL_WEBAUTHN_ORIGIN: WEB,
    CARTEL_WEBAUTHN_RP_ID: "localhost",
    DEMO_MODE: "true",
    E2E_READY: "1",
  };
  Object.assign(process.env, env);
  return env;
}
