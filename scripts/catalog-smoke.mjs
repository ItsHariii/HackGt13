// Builds and starts the web app against LOCAL Supabase only. No external catalog requests.
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(
  new URL("../apps/web/package.json", import.meta.url),
);
const { createClient } = require("@supabase/supabase-js");
const { createServerClient } = require("@supabase/ssr");
const raw = execFileSync(
  `${root}node_modules/.bin/supabase`,
  ["status", "--output", "json"],
  { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
);
const local = JSON.parse(raw.slice(raw.indexOf("{")));
assert(["localhost", "127.0.0.1"].includes(new URL(local.API_URL).hostname));
const localEnv = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: local.API_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: local.PUBLISHABLE_KEY,
  SUPABASE_SECRET_KEY: local.SECRET_KEY,
  SOURCES_ENABLED: "greathub",
  SENTRY_AUTH_TOKEN: "",
  SENTRY_DSN: "",
  NEXT_PUBLIC_SENTRY_DSN: "",
  AGENT_SIGNING_JWK: "",
  AGENT_KEY_ID: "",
  SHOPIFY_AGENT_PROFILE_URL: "",
  ICECAT_USERNAME: "",
  UPCITEMDB_USER_KEY: "",
};
// NEXT_PUBLIC_* values are compiled into the production bundle, even in server
// modules. Build with local public config instead of reusing a cloud/blank build.
execFileSync(
  process.execPath,
  [require.resolve("next/dist/bin/next"), "build"],
  {
    cwd: `${root}apps/web`,
    env: localEnv,
    stdio: "inherit",
    timeout: 120_000,
  },
);
const admin = createClient(local.API_URL, local.SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const socket = createServer();
await new Promise((resolve) => socket.listen(0, "127.0.0.1", resolve));
const port = socket.address().port;
await new Promise((resolve) => socket.close(resolve));
const base = `http://127.0.0.1:${port}`;
const child = spawn(
  process.execPath,
  [
    require.resolve("next/dist/bin/next"),
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    String(port),
  ],
  {
    cwd: `${root}apps/web`,
    stdio: ["ignore", "pipe", "pipe"],
    env: localEnv,
  },
);
// Consume logs without exposing environment values if startup fails.
child.stdout.resume();
child.stderr.resume();
const users = [];
async function session() {
  const cookies = new Map();
  const client = createServerClient(local.API_URL, local.PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => [...cookies].map(([name, value]) => ({ name, value })),
      setAll: (values) => {
        for (const { name, value } of values) cookies.set(name, value);
      },
    },
  });
  const result = await client.auth.signInAnonymously();
  assert.equal(result.error, null);
  users.push(result.data.user.id);
  return [...cookies].map(([key, value]) => `${key}=${value}`).join("; ");
}
try {
  let ready = false;
  for (let n = 0; n < 80; n++) {
    if (child.exitCode !== null)
      throw new Error("web server exited during startup");
    try {
      ready = (await fetch(`${base}/api/kits`)).ok;
    } catch {}
    if (ready) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert(ready, "web server did not become ready");
  assert.equal((await fetch(`${base}/api/search?q=`)).status, 400);
  assert.equal((await fetch(`${base}/api/products/invalid`)).status, 400);
  const timings = [];
  let productId;
  for (let n = 0; n < 25; n++) {
    const start = performance.now();
    const response = await fetch(`${base}/api/search?q=monitor`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /application\/x-ndjson/);
    assert.match(response.headers.get("cache-control"), /no-store/);
    const rows = (await response.text())
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    timings.push(performance.now() - start);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].source, "greathub");
    assert(["ok", "cached"].includes(rows[0].status));
    assert(rows[0].products.length > 0);
    productId = rows[0].products[0].id;
  }
  const detail = await (
    await fetch(`${base}/api/products/${productId}`)
  ).json();
  assert.equal(detail.proofScope, "item");
  assert(detail.offers.every((offer) => offer.tier === "full"));
  const cookie = await session(),
    otherCookie = await session();
  const endpoint = `${base}/api/kits/starter-home-office/fork`;
  assert.equal(
    (
      await fetch(endpoint, {
        method: "POST",
        headers: { cookie, origin: "https://wrong.example" },
      })
    ).status,
    403,
  );
  assert.equal(
    (await fetch(endpoint, { method: "POST", headers: { origin: base } }))
      .status,
    401,
  );
  const fork = await fetch(endpoint, {
    method: "POST",
    headers: { cookie, origin: base },
  });
  assert.equal(fork.status, 201);
  const { planId } = await fork.json();
  const plan = await (
    await fetch(`${base}/api/plans/${planId}`, { headers: { cookie } })
  ).json();
  assert(plan.requirements.length > 0);
  assert(plan.baskets[0].items.length > 0);
  assert(plan.baskets[0].items.every((item) => item.offer.tier === "full"));
  for (const path of [
    `/api/plans/${planId}`,
    `/api/search?q=monitor&planId=${planId}`,
    `/api/products/${productId}?planId=${planId}`,
  ]) {
    assert.equal(
      (await fetch(`${base}${path}`, { headers: { cookie: otherCookie } }))
        .status,
      404,
    );
  }
  const proof = await (
    await fetch(`${base}/api/products/${productId}?planId=${planId}`, {
      headers: { cookie },
    })
  ).json();
  assert(proof.proof.length > 0);
  assert(proof.proof.every((result) => result.scope.kind === "item"));
  const p95 = [...timings].sort((a, b) => a - b)[
    Math.ceil(timings.length * 0.95) - 1
  ];
  assert(
    p95 < 1500,
    `local first-source p95 ${p95.toFixed(0)}ms exceeds 1500ms`,
  );
  console.log(
    `Catalog API smoke passed: search/product/kit/plan, authentication/ownership/origin; 25 local searches p95=${p95.toFixed(0)}ms (first=${timings[0].toFixed(0)}ms).`,
  );
} finally {
  for (const id of users) await admin.auth.admin.deleteUser(id);
  child.kill("SIGTERM");
}
