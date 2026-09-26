import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const root = fileURLToPath(new URL("../../..", import.meta.url));
const status = JSON.parse(
  execFileSync(
    `${root}/node_modules/.bin/supabase`,
    ["status", "--output", "json"],
    { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  ),
);
assert.equal(
  new URL(status.API_URL).hostname,
  "127.0.0.1",
  "Smoke test only supports local Supabase",
);
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const owner = createClient(status.API_URL, status.PUBLISHABLE_KEY, options);
const other = createClient(status.API_URL, status.PUBLISHABLE_KEY, options);
const admin = createClient(status.API_URL, status.SECRET_KEY, options);
const userIds = [];
try {
  for (const client of [owner, other]) {
    const { data, error } = await client.auth.signInAnonymously();
    assert.ifError(error);
    userIds.push(data.user.id);
    await client.realtime.setAuth(data.session.access_token);
  }
  const { data: plan, error: planError } = await owner
    .from("foundation_plans")
    .insert({})
    .select("id")
    .single();
  assert.ifError(planError);
  const channel = owner.channel(`plan:${plan.id}`, {
    config: { private: true },
  });
  const pending = new Map();
  channel.on("broadcast", { event: "insert" }, ({ payload }) => {
    pending.get(payload.id)?.();
    pending.delete(payload.id);
  });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Owner subscription timed out")),
      10000,
    );
    channel.subscribe((state) => {
      if (state === "SUBSCRIBED") {
        clearTimeout(timeout);
        resolve();
      }
      if (state === "CHANNEL_ERROR") {
        clearTimeout(timeout);
        reject(new Error("Owner channel rejected"));
      }
    });
  });
  const blocked = other.channel(`plan:${plan.id}`, {
    config: { private: true },
  });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Expected explicit rejection for other user")),
      10000,
    );
    blocked.subscribe((state) => {
      if (state === "CHANNEL_ERROR") {
        clearTimeout(timeout);
        resolve();
      }
      if (state === "SUBSCRIBED") {
        clearTimeout(timeout);
        reject(new Error("Another user joined the private channel"));
      }
    });
  });
  const latencies = [];
  for (let index = 0; index < 5; index++) {
    const id = crypto.randomUUID();
    const started = performance.now();
    let timeout;
    const received = new Promise((resolve, reject) => {
      timeout = setTimeout(() => reject(new Error("Broadcast missing")), 5000);
      pending.set(id, () => {
        clearTimeout(timeout);
        resolve();
      });
    });
    const { error } = await owner
      .from("foundation_events")
      .insert({ id, plan_id: plan.id });
    if (error) {
      clearTimeout(timeout);
      throw error;
    }
    await received;
    latencies.push(Math.round(performance.now() - started));
  }
  const { data: stolen, error: readError } = await other
    .from("foundation_events")
    .select("id")
    .eq("plan_id", plan.id);
  assert.ifError(readError);
  assert.equal(stolen.length, 0);
  console.log(
    JSON.stringify({
      anonymousAuth: "passed",
      privateOwnerChannel: "passed",
      otherUserRejected: "passed",
      eventIsolation: "passed",
      broadcastMs: latencies,
    }),
  );
  assert.ok(
    Math.max(...latencies) < 500,
    "Local broadcast exceeded the 500 ms target",
  );
} finally {
  await Promise.all([owner.removeAllChannels(), other.removeAllChannels()]);
  for (const id of userIds) {
    const { error } = await admin.auth.admin.deleteUser(id);
    assert.ifError(error);
  }
}
