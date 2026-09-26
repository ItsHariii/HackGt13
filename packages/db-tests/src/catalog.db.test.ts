import { randomUUID } from "node:crypto";
import {
  cachedSearch,
  forkKit,
  loadPlan,
  localSearch,
  planContext,
} from "@proofcart/catalog/supabase";
import { requirementSetHash } from "@proofcart/contracts";
import type { Json } from "@proofcart/contracts/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  admin,
  anonClient,
  createUser,
  deleteUsers,
  type TestUser,
} from "./fixtures";

const tag = randomUUID();
const products: string[] = [];
const hashes: string[] = [];
let owner: TestUser, stranger: TestUser;
const identity = (
  source: string,
  suffix: string,
  rest: Record<string, unknown> = {},
) => ({
  source,
  externalId: `${tag}-${suffix}`,
  title: `Catalog ${tag} Monitor`,
  roles: ["monitor"],
  attributes: {},
  ...rest,
});
async function resolve(input: Record<string, unknown>) {
  const { data, error } = await admin.rpc("srv_catalog_identity", {
    p_product: input as Json,
  });
  if (error || !data) throw error ?? new Error("no identity");
  products.push(data);
  return data;
}
beforeAll(async () => {
  owner = await createUser();
  stranger = await createUser();
});
afterAll(async () => {
  await deleteUsers([owner, stranger]);
  if (products.length)
    await admin
      .from("products")
      .delete()
      .in("id", [...new Set(products)]);
  if (hashes.length)
    await admin.from("search_queries").delete().in("query_hash", hashes);
});

describe("catalog database services", () => {
  it("merges concurrent UPCitemdb and Icecat records by canonical GTIN", async () => {
    // Generate a valid unique GTIN for this test run.
    const digits = `29${Date.now().toString().slice(-10)}`;
    const sum = [...digits].reduce(
      (n, d, i) => n + Number(d) * (i % 2 === 0 ? 1 : 3),
      0,
    );
    const gtin = `${digits}${(10 - (sum % 10)) % 10}`;
    const [a, b] = await Promise.all([
      resolve(identity("upcitemdb", "gtin-a", { gtin })),
      resolve(identity("icecat", "gtin-b", { gtin: gtin.padStart(14, "0") })),
    ]);
    expect(a).toBe(b);
    const refs = await admin
      .from("product_external_refs")
      .select("source")
      .eq("product_id", a);
    expect(refs.data?.map((r) => r.source).sort()).toEqual([
      "icecat",
      "upcitemdb",
    ]);
  });
  it("falls back to UPID then exact brand/MPN; different models remain distinct", async () => {
    const a = await resolve(identity("upcitemdb", "upid-a", { upid: tag }));
    expect(await resolve(identity("icecat", "upid-b", { upid: tag }))).toBe(a);
    const b = await resolve(
      identity("upcitemdb", "mpn-a", { brand: tag, mpn: " Exact-Model " }),
    );
    expect(
      await resolve(
        identity("icecat", "mpn-b", {
          brand: tag.toUpperCase(),
          mpn: "exact-model",
        }),
      ),
    ).toBe(b);
    expect(
      await resolve(
        identity("icecat", "mpn-c", { brand: tag, mpn: "other-model" }),
      ),
    ).not.toBe(b);
  });
  it("keeps identity and kit mutations server-only", async () => {
    expect(
      (
        await anonClient().rpc("srv_catalog_identity", {
          p_product: identity("icecat", "denied") as Json,
        })
      ).error,
    ).not.toBeNull();
    expect(
      (
        await owner.client.rpc("srv_fork_kit", {
          p_user_id: stranger.id,
          p_slug: "starter-home-office",
          p_specs: [],
          p_hash: `sha256:${"0".repeat(64)}`,
        })
      ).error,
    ).not.toBeNull();
    await expect(
      resolve(identity("shopify", "forbidden")),
    ).rejects.toBeTruthy();
  });
  it("searches the requested source and reuses identity caches", async () => {
    const signal = new AbortController().signal;
    const query = `Catalog ${tag}`;
    let calls = 0;
    const run = () =>
      cachedSearch(admin, "icecat", query, 20, signal, async () => {
        calls++;
        return localSearch(admin, query, "icecat", 20, signal);
      });
    const first = await run(),
      second = await run();
    expect(first.products.length).toBeGreaterThan(0);
    expect(
      first.products.every((p) => p.refs.some((r) => r.source === "icecat")),
    ).toBe(true);
    expect(second.cached).toBe(true);
    expect(calls).toBe(1);
    const rows = await admin
      .from("search_queries")
      .select("query_hash")
      .contains("query", { query: query.toLowerCase() });
    hashes.push(...(rows.data ?? []).map((r) => r.query_hash));
  });
  it("does not cache Shopify search results", async () => {
    let calls = 0;
    const run = () =>
      cachedSearch(
        admin,
        "shopify",
        tag,
        20,
        new AbortController().signal,
        async () => {
          calls++;
          return [];
        },
      );
    await run();
    await run();
    expect(calls).toBe(2);
  });
  it("forks kit rules and starter basket atomically, with correct provenance/hash and tiers", async () => {
    const forked = await forkKit(admin, "starter-home-office", owner.id);
    const plan = await loadPlan(admin, forked.planId, owner.id);
    expect(plan.requirements.length).toBeGreaterThan(0);
    expect(
      plan.requirements.every((r) => r.provenance.kind === "pack_default"),
    ).toBe(true);
    expect(plan.set?.hash).toBe(await requirementSetHash(plan.requirements));
    const starter = await admin
      .from("kit_items")
      .select("role,qty")
      .eq("kit_slug", "starter-home-office");
    expect(plan.baskets[0]?.items).toHaveLength(starter.data?.length ?? 0);
    expect(plan.baskets[0]?.items.every((i) => i.offer.tier === "full")).toBe(
      true,
    );
    await expect(
      planContext(admin, forked.planId, stranger.id),
    ).rejects.toMatchObject({ status: 404 });
    expect(
      (await stranger.client.from("plans").select("id").eq("id", forked.planId))
        .data,
    ).toEqual([]);
  });
  it("rejects a changed kit without leaving a partial plan", async () => {
    const before = await admin
      .from("plans")
      .select("id")
      .eq("user_id", owner.id);
    const result = await admin.rpc("srv_fork_kit", {
      p_user_id: owner.id,
      p_slug: "starter-home-office",
      p_specs: [],
      p_hash: `sha256:${"0".repeat(64)}`,
    });
    expect(result.error?.message).toContain("kit_changed");
    const after = await admin
      .from("plans")
      .select("id")
      .eq("user_id", owner.id);
    expect(after.data).toEqual(before.data);
  });
  it("rolls back the entire fork when a starter product has no offer", async () => {
    const slug = `catalog-test-${tag}`;
    const id = await resolve(identity("icecat", "no-offer"));
    const before = await admin
      .from("plans")
      .select("id")
      .eq("user_id", owner.id);
    try {
      const kit = await admin.from("kits").insert({
        slug,
        title: "Atomic fork test",
        pack: "home-office",
        description: "test",
      });
      if (kit.error) throw kit.error;
      const item = await admin
        .from("kit_items")
        .insert({ kit_slug: slug, role: "monitor", product_id: id, qty: 2 });
      if (item.error) throw item.error;
      await expect(forkKit(admin, slug, owner.id)).rejects.toMatchObject({
        code: "kit_offer_unavailable",
      });
      const after = await admin
        .from("plans")
        .select("id")
        .eq("user_id", owner.id);
      expect(after.data).toEqual(before.data);
    } finally {
      await admin.from("kits").delete().eq("slug", slug);
    }
  });
});
