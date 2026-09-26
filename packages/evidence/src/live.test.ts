import { apparel, homeOffice, travel } from "@cartel/rule-packs";
import { describe, expect, it } from "vitest";
import { createCpscAdapter } from "./adapters/cpsc";
import { createIcecat, icecatClaims } from "./adapters/icecat";
import { createUpcItemDb } from "./adapters/upcitemdb";
import { memoryStore } from "./test-utils";

// Calls the real sources. Off by default: UPCitemdb's trial allows 100 calls a
// day per IP. Run with EVIDENCE_LIVE=1 (plus ICECAT_USERNAME / ICECAT_API_TOKEN).
const live = process.env.EVIDENCE_LIVE === "1";
const PACKS = [homeOffice, apparel, travel];

describe.skipIf(!live)("live sources", () => {
  it("UPCitemdb finds real 27-inch 4K monitors with GTIN, brand and model", async () => {
    const upc = createUpcItemDb({
      store: memoryStore().store,
      timeoutMs: 15_000,
    });
    const res = await upc.search("27 inch 4K USB-C monitor");
    expect(res.products.length).toBeGreaterThan(0);
    for (const p of res.products) expect(p.gtin).toMatch(/^\d{14}$/);
    expect(
      res.products.some((p) => p.brand && p.mpn && p.roles.includes("monitor")),
    ).toBe(true);
    expect(upc.budget.remaining).not.toBeNull();
  }, 20_000);

  it.skipIf(!process.env.ICECAT_USERNAME)(
    "Icecat returns a verified USB-C power rating for the Dell U2723QE",
    async () => {
      const icecat = createIcecat({
        store: memoryStore().store,
        username: process.env.ICECAT_USERNAME ?? "",
        ...(process.env.ICECAT_API_TOKEN
          ? { apiToken: process.env.ICECAT_API_TOKEN }
          : {}),
        timeoutMs: 15_000,
      });
      const { sheet } = await icecat.byGtin("00884116415589");
      expect(sheet).not.toBeNull();
      const pd = icecatClaims(sheet as NonNullable<typeof sheet>, {
        packs: PACKS,
      }).find((c) => c.field === "monitor.usb_c_pd_watts");
      expect(pd).toMatchObject({
        value: { value: 90, unit: "W" },
        state: "verified",
      });
      expect((await icecat.byGtin("00812345000016")).sheet).toBeNull();
    },
    20_000,
  );

  it("CPSC finds the Anker A1647 recall and nothing for a fictional brand", async () => {
    const cpsc = createCpscAdapter({
      store: memoryStore().store,
      timeoutMs: 20_000,
    });
    expect(
      (await cpsc.checkRecalls({ brand: "Anker", model: "A1647" })).check
        .active,
    ).toBe(true);
    expect(
      (await cpsc.checkRecalls({ brand: "Vireo", model: "U2727" })).check
        .active,
    ).toBe(false);
  }, 45_000);
});
