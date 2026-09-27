#!/usr/bin/env node
// `pnpm demo:check` (TASKS T18.2): the parts of the pre-judging check a script can do.
// Run 30 minutes before judging, after `pnpm demo:reset`. It changes nothing, except
// that `--visa` makes one $1.00 authorization on the Visa Acceptance sandbox.
//
//   pnpm demo:check           health, JWKS, pages, bench, ledgers, search
//   pnpm demo:check --visa    also the Visa Acceptance sandbox smoke test
//
// The checklist it prints at the end is for people: Touch ID, windows, sound, Wi-Fi.
// Configuration: see scripts/demo-env.mjs.
import { spawnSync } from "node:child_process";
import {
  adminClient,
  demoUser,
  loadDemoEnv,
  message,
  reporter,
  root,
  SEARCH_QUERY,
  search,
} from "./demo-env.mjs";

const config = loadDemoEnv();
const r = reporter();
const env = process.env;

console.log(`demo:check · env: ${config.loaded.join(", ") || "shell only"}`);

async function get(url) {
  return fetch(url, {
    redirect: "manual",
    signal: AbortSignal.timeout(15_000),
    headers: { "Cache-Control": "no-store" },
  });
}

// Production URLs, health, JWKS ------------------------------------------------------------
for (const [name, base] of [
  ["Cartel", config.cartel],
  ["GreatHub", config.greathub],
]) {
  if (!base) {
    r.fail(`${name} URL`, `${name.toUpperCase()}_URL is not set`);
    continue;
  }
  if (!base.startsWith("https://"))
    r.warn(
      `${name} URL`,
      `${base} is not HTTPS: passkeys need the production domain`,
    );
  try {
    const res = await get(`${base}/api/health`);
    const body = await res.json().catch(() => ({}));
    const checks = Object.entries(body.checks ?? {})
      .map(([k, v]) => `${k} ${v}`)
      .join(", ");
    if (res.ok && body.status === "ok") r.ok(`${name} /api/health`, checks);
    else r.fail(`${name} /api/health`, `HTTP ${res.status} ${checks}`);
  } catch (error) {
    r.fail(`${name} /api/health`, message(error));
  }
}

if (config.cartel) {
  try {
    const res = await get(`${config.cartel}/.well-known/jwks.json`);
    const body = await res.json().catch(() => ({}));
    const kids = (body.keys ?? []).map((k) => k.kid).join(", ");
    if (res.ok && kids) r.ok("Cartel JWKS", kids);
    else r.fail("Cartel JWKS", `HTTP ${res.status}`);
  } catch (error) {
    r.fail("Cartel JWKS", message(error));
  }
  // GreatHub's own health check fetches CARTEL_JWKS_URL, so its `jwks ok` above is the
  // "reachable from GreatHub" check.
  for (const path of [
    "/",
    "/new",
    "/plans/flagship",
    "/plans/flagship/contract",
    "/plans/flagship/diff/deal-trap",
    "/orders/CT-0926-0001",
    "/ledger/flagship",
    "/explore",
    "/bench",
  ]) {
    try {
      const res = await get(`${config.cartel}${path}`);
      if (res.status === 200) r.ok(`Cartel ${path}`, "200");
      else r.fail(`Cartel ${path}`, `HTTP ${res.status}`);
    } catch (error) {
      r.fail(`Cartel ${path}`, message(error));
    }
  }
}
if (config.greathub) {
  for (const path of ["/", "/chaos"]) {
    try {
      const res = await get(`${config.greathub}${path}`);
      // /chaos redirects to sign-in without the admin cookie; that still proves it serves.
      if (res.status < 400) r.ok(`GreatHub ${path}`, String(res.status));
      else r.fail(`GreatHub ${path}`, `HTTP ${res.status}`);
    } catch (error) {
      r.fail(`GreatHub ${path}`, message(error));
    }
  }
}

// Payment rail -----------------------------------------------------------------------------
const rail = env.PAYMENT_RAIL ?? "(unset)";
const wanted = env.DEMO_PAYMENT_RAIL ?? "visa_acceptance";
if (rail === wanted)
  r.ok("PAYMENT_RAIL", `${rail} (local env; confirm Vercel matches)`);
else r.fail("PAYMENT_RAIL", `${rail}, expected ${wanted}`);

if (process.argv.includes("--visa")) {
  const run = spawnSync(
    "pnpm",
    ["exec", "vitest", "run", "packages/payments/src/sandbox.smoke.test.ts"],
    {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...env, VISA_ACCEPTANCE_SMOKE: "1" },
      timeout: 120_000,
    },
  );
  const out = `${run.stdout ?? ""}${run.stderr ?? ""}`;
  if (run.status === 0 && /1 passed/.test(out))
    r.ok("Visa Acceptance sandbox", "$1.00 authorized");
  else if (run.status === 0)
    r.fail(
      "Visa Acceptance sandbox",
      "skipped: VISA_ACCEPTANCE_* not set or run env is not the sandbox",
    );
  else r.fail("Visa Acceptance sandbox", `vitest exit ${run.status}`);
} else {
  r.skip("Visa Acceptance sandbox", "run with --visa");
}

// Bench and ledgers ------------------------------------------------------------------------
if (!config.supabaseUrl || !config.secretKey) {
  r.fail(
    "Database",
    "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required",
  );
} else {
  const db = adminClient(config.supabaseUrl, config.secretKey);
  try {
    const { data, error } = await db
      .from("bench_runs")
      .select("git_sha,passed,total,created_at")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data)
      r.warn(
        "Latest bench run",
        "none stored; /bench shows its live cases only",
      );
    else if (data.passed === data.total)
      r.ok(
        "Latest bench run",
        `${data.passed}/${data.total} · ${data.git_sha.slice(0, 7)} · ${data.created_at}`,
      );
    else
      r.fail(
        "Latest bench run",
        `${data.passed}/${data.total} · ${data.git_sha.slice(0, 7)}`,
      );
  } catch (error) {
    r.fail("Latest bench run", message(error));
  }

  try {
    const userId = await demoUser(db, config);
    if (!userId) throw new Error("set DEMO_USER_ID or DEMO_USER_EMAIL");
    const { data: plans, error } = await db
      .from("plans")
      .select("id,title")
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    const broken = [];
    for (const p of plans) {
      const { data: seq, error: e } = await db.rpc("srv_verify_ledger", {
        p_plan_id: p.id,
      });
      if (e) throw new Error(e.message);
      if (seq !== null) broken.push(`${p.title} at seq ${seq}`);
    }
    if (broken.length > 0) r.fail("Ledger chains", broken.join("; "));
    else
      r.ok(
        "Ledger chains",
        plans.length === 0
          ? "no stored plans after reset; the flagship chain verifies in the browser"
          : `${plans.length} plan(s) verify`,
      );
    for (const table of ["signing_credentials", "payment_instruments"]) {
      const { count, error: e } = await db
        .from(table)
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId);
      if (e) throw new Error(e.message);
      if (count && count > 0) r.ok(`Demo user ${table}`, String(count));
      else r.fail(`Demo user ${table}`, "none: enroll in /settings");
    }
  } catch (error) {
    r.fail("Demo user", message(error));
  }
}

// Explore ----------------------------------------------------------------------------------
if (config.cartel) {
  try {
    const chunks = await search(config.cartel);
    const summary = chunks
      .map((c) => `${c.source} ${c.status} (${c.products.length})`)
      .join(", ");
    const empty = chunks.filter(
      (c) => !["ok", "cached"].includes(c.status) || c.products.length === 0,
    );
    if (chunks.length > 0 && empty.length === 0)
      r.ok(`Search "${SEARCH_QUERY}"`, summary);
    else r.fail(`Search "${SEARCH_QUERY}"`, summary || "no sources answered");
  } catch (error) {
    r.fail(`Search "${SEARCH_QUERY}"`, message(error));
  }
}

console.log(`
By hand (docs/DEMO.md has the full list):
  [ ] Touch ID signs on the production domain; the phone backup is signed in
  [ ] Chaos Panel and Agent Log open in their own window; Reset has run
  [ ] Reduced motion OFF on the demo laptop; volume and notifications muted
  [ ] Phone hotspot ready as the Wi-Fi fallback`);
console.log(
  r.failed === 0
    ? "\nAll automated checks passed."
    : `\n${r.failed} check(s) failed.`,
);
process.exit(r.failed === 0 ? 0 : 1);
