#!/usr/bin/env node
// Runs the ACP contract suite (packages/acp/src/greathub.contract.test.ts) against a real GreatHub:
//   1. ephemeral Ed25519 agent, second-agent and grant keys, served from a local JWKS
//   2. a local order-webhook receiver that checks the HMAC signature
//   3. GreatHub (`next dev`) against the local Supabase stack, on GREATHUB_PORT (default 3201)
//
//   node scripts/greathub-contract.mjs            simulated rail (no network)
//   node scripts/greathub-contract.mjs --visa     Visa Acceptance sandbox (VISA_ACCEPTANCE_* from the env
//                                                 or apps/greathub/.env.local)
// Requires `pnpm db:start` and a fresh `pnpm db:reset`.
import { execFileSync, spawn } from "node:child_process";
import {
  createHmac,
  generateKeyPairSync,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bin = (name) => join(root, "node_modules", ".bin", name);
const port = Number(process.env.GREATHUB_PORT ?? 3201);
const visa = process.argv.includes("--visa");

function supabaseEnv() {
  const out = execFileSync(bin("supabase"), ["status", "-o", "env"], {
    cwd: root,
    encoding: "utf8",
  });
  return Object.fromEntries(
    out
      .split("\n")
      .map((l) => /^([A-Z_]+)="?(.*?)"?$/.exec(l))
      .filter(Boolean)
      .map((m) => [m[1], m[2]]),
  );
}

function keyPair(kid) {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const priv = privateKey.export({ format: "jwk" });
  const pub = publicKey.export({ format: "jwk" });
  return {
    private: JSON.stringify({ ...priv, kid }),
    public: { ...pub, kid, use: "sig", alg: "EdDSA" },
  };
}

function dotenv(file) {
  try {
    return Object.fromEntries(
      readFileSync(file, "utf8")
        .split("\n")
        .map((l) => /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(l.trim()))
        .filter(Boolean)
        .map((m) => [
          m[1],
          m[2].replace(/\s+#.*$/, "").replace(/^"(.*)"$/, "$1"),
        ]),
    );
  } catch {
    return {};
  }
}

const listen = (server) =>
  new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve(server.address().port)),
  );

const agent = keyPair("ct-agent-contract");
const agent2 = keyPair("ct-agent-contract-2");
const grant = keyPair("ct-grant-contract");
const webhookSecret = randomBytes(24).toString("hex");
const adminToken = randomBytes(24).toString("hex");
const events = [];

const jwks = createServer((req, res) => {
  if (req.url !== "/.well-known/jwks.json") return res.writeHead(404).end();
  res.writeHead(200, { "content-type": "application/json" });
  res.end(
    JSON.stringify({ keys: [agent.public, agent2.public, grant.public] }),
  );
});
const hooks = createServer((req, res) => {
  if (req.method === "GET") {
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(JSON.stringify(events));
  }
  let body = "";
  req.on("data", (c) => {
    body += c;
  });
  req.on("end", () => {
    const m = /^t=(\d+),v1=([0-9a-f]{64})$/.exec(
      req.headers["x-signature"] ?? "",
    );
    const expected =
      m &&
      createHmac("sha256", webhookSecret)
        .update(`${m[1]}.${body}`)
        .digest("hex");
    const fresh = m && Math.abs(Date.now() / 1000 - Number(m[1])) <= 300;
    if (
      !m ||
      !fresh ||
      !timingSafeEqual(Buffer.from(expected), Buffer.from(m[2]))
    ) {
      res.writeHead(401).end();
      return;
    }
    events.push(JSON.parse(body));
    res.writeHead(204).end();
  });
});
const jwksPort = await listen(jwks);
const hooksPort = await listen(hooks);

const sb = supabaseEnv();
const localVisa = dotenv(join(root, "apps/greathub/.env.local"));
const origin = `http://localhost:${port}`;
const greathubEnv = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: sb.API_URL,
  SUPABASE_SECRET_KEY: sb.SECRET_KEY,
  GREATHUB_PUBLIC_ORIGIN: origin,
  CARTEL_BASE_URL: "http://localhost:3000",
  CARTEL_JWKS_URL: `http://127.0.0.1:${jwksPort}/.well-known/jwks.json`,
  CARTEL_WEBHOOK_URL: `http://127.0.0.1:${hooksPort}/webhooks`,
  CARTEL_WEBAUTHN_ORIGIN: "http://localhost:3000",
  CARTEL_WEBAUTHN_RP_ID: "localhost",
  CARTEL_AGENT_KID_PREFIX: "ct-agent-",
  CARTEL_GRANT_KID_PREFIX: "ct-grant-",
  GREATHUB_WEBHOOK_SECRET: webhookSecret,
  CHAOS_ADMIN_TOKEN: adminToken,
  DEMO_MODE: "true",
  PAYMENT_RAIL: visa ? "visa_acceptance" : "simulated",
  SENTRY_DSN: "",
  ...(visa
    ? Object.fromEntries(
        [
          "VISA_ACCEPTANCE_RUN_ENV",
          "VISA_ACCEPTANCE_MERCHANT_ID",
          "VISA_ACCEPTANCE_KEY_ID",
          "VISA_ACCEPTANCE_SECRET_KEY",
        ].map((k) => [k, process.env[k] ?? localVisa[k] ?? ""]),
      )
    : {}),
};

// A separate distDir keeps this server off the `.next` of any `next dev` already running here;
// Next may add that dir to tsconfig.json, so the original is restored on exit.
const tsconfigPath = join(root, "apps/greathub/tsconfig.json");
const tsconfig = readFileSync(tsconfigPath, "utf8");
const server = spawn(
  join(root, "apps/greathub/node_modules/.bin/next"),
  ["dev", "--port", String(port)],
  {
    cwd: join(root, "apps/greathub"),
    env: { ...greathubEnv, NEXT_DIST_DIR: ".next-contract" },
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  },
);
let serverLog = "";
server.stdout.on("data", (d) => {
  serverLog += d;
});
server.stderr.on("data", (d) => {
  serverLog += d;
});

function shutdown(code) {
  try {
    process.kill(-server.pid, "SIGTERM");
  } catch {}
  if (readFileSync(tsconfigPath, "utf8") !== tsconfig)
    writeFileSync(tsconfigPath, tsconfig);
  try {
    writeFileSync(
      join(root, "apps/greathub/.next-contract/contract-server.log"),
      serverLog,
    );
  } catch {}
  jwks.close();
  hooks.close();
  process.exit(code);
}
process.on("SIGINT", () => shutdown(130));

const deadline = Date.now() + 90_000;
for (;;) {
  try {
    const res = await fetch(`${origin}/policies`);
    if (res.ok) break;
  } catch {}
  if (Date.now() > deadline || server.exitCode !== null) {
    console.error(serverLog.slice(-4000));
    console.error("GreatHub did not start");
    shutdown(1);
  }
  await new Promise((r) => setTimeout(r, 500));
}
console.log(
  `GreatHub up at ${origin} (${visa ? "Visa Acceptance sandbox" : "simulated rail"})`,
);

const test = spawn(
  bin("vitest"),
  ["run", "--project", "acp", "greathub.contract"],
  {
    cwd: root,
    stdio: "inherit",
    env: {
      ...process.env,
      ACP_CONTRACT_BASE_URL: origin,
      ACP_CONTRACT_AGENT_JWK: agent.private,
      ACP_CONTRACT_AGENT2_JWK: agent2.private,
      ACP_CONTRACT_GRANT_JWK: grant.private,
      ACP_CONTRACT_ADMIN_TOKEN: adminToken,
      ACP_CONTRACT_WEBAUTHN_ORIGIN: "http://localhost:3000",
      ACP_CONTRACT_RP_ID: "localhost",
      ACP_CONTRACT_INSTRUMENT: visa ? "sandbox:visa-test-card" : "simulated:ok",
      ACP_CONTRACT_EVENTS_URL: `http://127.0.0.1:${hooksPort}/events`,
    },
  },
);
test.on("exit", (code) => {
  if (code !== 0)
    console.error(
      serverLog
        .split("\n")
        .filter((l) => /error|fatal|warn/i.test(l))
        .slice(-40)
        .join("\n"),
    );
  shutdown(code ?? 1);
});
