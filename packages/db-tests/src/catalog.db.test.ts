import { Requirement } from "@proofcart/contracts";
import { describe, expect, it } from "vitest";
import { anonClient, demomartClient, must } from "./fixtures";

describe("catalog and kits", () => {
  it("finds the USB-C monitors for a typo query, signed out", async () => {
    const results = must(
      await anonClient().rpc("search_products", {
        p_query: "usb c monitr",
        p_limit: 5,
      }),
    );
    expect(
      results
        .slice(0, 2)
        .map((r) => r.title)
        .sort(),
    ).toEqual([
      'Halden M27Q-USBC 27" 4K USB-C Monitor',
      'Vireo U2727 27" 4K USB-C Monitor',
    ]);
  });

  it("seeds kit requirements that satisfy the contracts Requirement schema", async () => {
    const rows = must(
      await anonClient()
        .from("kit_requirements")
        .select("kit_slug, requirement_key, importance, spec"),
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      const parsed = Requirement.safeParse(row.spec);
      expect(
        parsed.success,
        `${row.kit_slug}/${row.requirement_key}: ${parsed.error?.message}`,
      ).toBe(true);
      expect(parsed.data?.id).toBe(row.requirement_key);
      expect(parsed.data?.importance).toBe(row.importance);
    }
  });

  it("keeps the DemoMart schema reachable only with the secret key", async () => {
    const serverView = must(
      await demomartClient("secret")
        .from("offers")
        .select("id")
        .eq("id", "dm_off_48300"),
    );
    expect(serverView).toEqual([{ id: "dm_off_48300" }]);
    const clientView = await demomartClient("publishable")
      .from("offers")
      .select("id");
    expect(clientView.error?.code).toBe("42501");
  });
});
