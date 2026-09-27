#!/usr/bin/env node
// `pnpm demo:reset` (TASKS T18.1, SDD §25.1). Run it before every rehearsal and within
// 10 minutes of going on stage (the search cache lasts 10 minutes).
//
//   1. GreatHub: restore the seeded catalog (Chaos Panel "Reset").
//   2. Delete the demo user's plans. Their enrolled card and signing passkey stay; the
//      script fails if either count changes. Ledger events stay too (append-only).
//   3. Warm the AI prompt cache (`pnpm ai:warm`).
//   4. Pre-run the bench, if `@cartel/bench` has a `bench` script (Phase 16).
//   5. Warm the search cache for "navy linen shirt".
//
//   pnpm demo:reset --dry-run    show what would change; change nothing
//
// Configuration: see scripts/demo-env.mjs.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
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

const dryRun = process.argv.includes("--dry-run");
const config = loadDemoEnv();
const r = reporter();

console.log(
  `demo:reset${dryRun ? " (dry run)" : ""} · env: ${config.loaded.join(", ") || "shell only"}`,
);
console.log(
  `  Cartel ${config.cartel ?? "?"} · GreatHub ${config.greathub ?? "?"} · Supabase ${config.supabaseUrl ?? "?"}`,
);

// 1. GreatHub catalog ----------------------------------------------------------------------
if (!config.greathub || !config.chaosToken) {
  r.fail("GreatHub reset", "GREATHUB_URL and CHAOS_ADMIN_TOKEN are required");
} else if (dryRun) {
  r.skip("GreatHub reset", `would POST ${config.greathub}/api/chaos/reset`);
} else {
  try {
    const res = await fetch(`${config.greathub}/api/chaos/reset`, {
      method: "POST",
      headers: { authorization: `Bearer ${config.chaosToken}` },
      signal: AbortSignal.timeout(15_000),
    });
    const body = await res.json().catch(() => ({}));
    if (res.status === 201) r.ok("GreatHub reset", "seeded catalog restored");
    else r.fail("GreatHub reset", `HTTP ${res.status} ${body.error ?? ""}`);
  } catch (error) {
    r.fail("GreatHub reset", message(error));
  }
}

// 2. Demo user's plans ---------------------------------------------------------------------
async function countFor(db, table, userId) {
  const { count, error } = await db
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (error) throw new Error(`${table}: ${error.message}`);
  return count ?? 0;
}

if (!config.supabaseUrl || !config.secretKey) {
  r.fail(
    "Demo user plans",
    "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required",
  );
} else {
  const db = adminClient(config.supabaseUrl, config.secretKey);
  try {
    const userId = await demoUser(db, config);
    if (!userId) throw new Error("set DEMO_USER_ID or DEMO_USER_EMAIL");
    const before = {
      passkeys: await countFor(db, "signing_credentials", userId),
      cards: await countFor(db, "payment_instruments", userId),
    };
    const { data: plans, error } = await db
      .from("plans")
      .select("id,title")
      .eq("user_id", userId);
    if (error) throw new Error(`plans: ${error.message}`);
    if (dryRun) {
      r.skip(
        "Demo user plans",
        `would delete ${plans.length}: ${plans.map((p) => p.title).join(", ") || "none"}`,
      );
    } else if (plans.length > 0) {
      const { error: del } = await db
        .from("plans")
        .delete()
        .eq("user_id", userId);
      if (del) throw new Error(`delete: ${del.message}`);
      r.ok("Demo user plans", `${plans.length} deleted`);
    } else {
      r.ok("Demo user plans", "already clean");
    }
    const after = {
      passkeys: await countFor(db, "signing_credentials", userId),
      cards: await countFor(db, "payment_instruments", userId),
    };
    if (after.passkeys !== before.passkeys || after.cards !== before.cards)
      r.fail(
        "Card and passkey kept",
        `passkeys ${before.passkeys} → ${after.passkeys}, cards ${before.cards} → ${after.cards}`,
      );
    else if (after.passkeys === 0 || after.cards === 0)
      r.warn(
        "Card and passkey kept",
        `${after.passkeys} passkeys, ${after.cards} cards: enroll before the demo (/settings)`,
      );
    else
      r.ok(
        "Card and passkey kept",
        `${after.passkeys} passkeys, ${after.cards} cards`,
      );
  } catch (error) {
    r.fail("Demo user plans", message(error));
  }
}

// 3. AI prompt cache -----------------------------------------------------------------------
if (dryRun) {
  r.skip("AI prompt cache", "would run pnpm ai:warm");
} else {
  const run = spawnSync("pnpm", ["--silent", "ai:warm"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 180_000,
  });
  const out = `${run.stdout ?? ""}${run.stderr ?? ""}`.trim();
  const last = out.split("\n").at(-1) ?? "";
  if (run.status === 0 && last.startsWith("- "))
    r.skip("AI prompt cache", last.slice(2));
  else if (run.status === 0) r.ok("AI prompt cache", last.replace(/^✓ /, ""));
  else
    r.fail("AI prompt cache", last.replace(/^✗ /, "") || `exit ${run.status}`);
}

// 4. Bench ---------------------------------------------------------------------------------
const bench = JSON.parse(
  readFileSync(join(root, "packages/bench/package.json"), "utf8"),
);
if (!bench.scripts?.bench) {
  r.skip(
    "Bench pre-run",
    "no `bench` script in @cartel/bench yet (Phase 16); /bench runs its live cases on click",
  );
} else if (dryRun) {
  r.skip("Bench pre-run", "would run pnpm --filter @cartel/bench bench");
} else {
  const run = spawnSync("pnpm", ["--filter", "@cartel/bench", "bench"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 600_000,
  });
  const last =
    `${run.stdout ?? ""}${run.stderr ?? ""}`.trim().split("\n").at(-1) ?? "";
  if (run.status === 0) r.ok("Bench pre-run", last);
  else r.fail("Bench pre-run", last || `exit ${run.status}`);
}

// 5. Search cache --------------------------------------------------------------------------
if (!config.cartel) {
  r.fail("Search cache", "CARTEL_URL is required");
} else if (dryRun) {
  r.skip(
    "Search cache",
    `would GET ${config.cartel}/api/search?q=${SEARCH_QUERY}`,
  );
} else {
  try {
    const chunks = await search(config.cartel);
    const summary = chunks
      .map((c) => `${c.source} ${c.status} (${c.products.length})`)
      .join(", ");
    const good = chunks.filter(
      (c) => ["ok", "cached"].includes(c.status) && c.products.length > 0,
    );
    if (good.length === 0) r.fail(`Search "${SEARCH_QUERY}"`, summary);
    else if (good.length < chunks.length)
      r.warn(`Search "${SEARCH_QUERY}"`, summary);
    else r.ok(`Search "${SEARCH_QUERY}"`, `${summary}; cached for 10 min`);
  } catch (error) {
    r.fail(`Search "${SEARCH_QUERY}"`, message(error));
  }
}

console.log(
  r.failed > 0
    ? `${r.failed} step(s) failed.`
    : dryRun
      ? "Dry run: nothing changed."
      : "Reset done. Keep the Chaos Panel open and run `pnpm demo:check`.",
);
process.exit(r.failed === 0 ? 0 : 1);
