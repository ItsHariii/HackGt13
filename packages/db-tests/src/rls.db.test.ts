import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  anonClient,
  createPlan,
  createUser,
  deleteUsers,
  must,
  signedContract,
  type TestUser,
} from "./fixtures";

describe("row-level security through the Data API", () => {
  let a: TestUser;
  let b: TestUser;
  let planId: string;

  beforeAll(async () => {
    [a, b] = [await createUser(), await createUser()];
    planId = await createPlan(a, "A's plan");
    await signedContract(a, planId);
  });
  afterAll(() => deleteUsers([a, b]));

  it("gives each user a profile on sign-in", async () => {
    const profile = must(
      await a.client
        .from("profiles")
        .select("user_id, default_autonomy")
        .single(),
    );
    expect(profile).toEqual({ user_id: a.id, default_autonomy: "balanced" });
  });

  it("hides A's plan, contract and ledger from B", async () => {
    for (const table of [
      "plans",
      "contract_versions",
      "contract_signatures",
      "ledger_events",
    ] as const) {
      const rows = must(await b.client.from(table).select("*"));
      expect(rows, table).toHaveLength(0);
      const own = must(await a.client.from(table).select("*"));
      expect(own.length, table).toBeGreaterThan(0);
    }
  });

  it("lets B change nothing of A's", async () => {
    const updated = must(
      await b.client
        .from("plans")
        .update({ title: "pwned" })
        .eq("id", planId)
        .select(),
    );
    expect(updated).toHaveLength(0);
    const deleted = must(
      await b.client.from("plans").delete().eq("id", planId).select(),
    );
    expect(deleted).toHaveLength(0);
    const insert = await b.client.from("requirement_sets").insert({
      plan_id: planId,
      version: 2,
      hash: `sha256:${"9".repeat(64)}`,
      created_by: `user:${b.id}`,
    });
    expect(insert.error?.code).toBe("42501");
    const plan = must(
      await a.client.from("plans").select("title").eq("id", planId).single(),
    );
    expect(plan.title).toBe("A's plan");
  });

  it("never lets a client write contract status", async () => {
    const result = await a.client
      .from("contract_versions")
      .update({ status: "executing" })
      .eq("plan_id", planId);
    expect(result.error?.code).toBe("42501");
  });

  it("lets signed-out visitors browse the catalog but nothing else", async () => {
    const anon = anonClient();
    const products = must(await anon.from("products").select("id").limit(5));
    expect(products.length).toBe(5);
    const plans = await anon.from("plans").select("id");
    expect(plans.error?.code).toBe("42501");
  });
});
