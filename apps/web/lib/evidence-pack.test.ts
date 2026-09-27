import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("react", async (orig) => ({
  ...(await orig<typeof import("react")>()),
  cache: <T>(fn: T) => fn,
}));

const { unzipSync, verifyPack, matchDelivery } = await import(
  "@cartel/evidence-pack"
);
const e = await import("./evidence-pack");

describe("flagship Evidence Pack", () => {
  it("verifies end to end, demo signature included", async () => {
    const pack = await e.flagshipPack();
    const files = unzipSync(pack.zip);
    const report = await verifyPack((p) => files[p]);
    expect(report.checks.filter((c) => !c.ok)).toEqual([]);
    expect(report.orderId).toBe("CT-0926-0001");
    expect(new TextDecoder().decode(files["summary.pdf"]?.subarray(0, 5))).toBe(
      "%PDF-",
    );
    expect(new TextDecoder().decode(files["README.txt"])).toContain(
      "Demo plan",
    );
  }, 30_000);

  it("is reproducible", async () => {
    const [a, b] = [await e.flagshipPack(), await e.flagshipPack()];
    expect(b.sha256).toBe(a.sha256);
  }, 30_000);
});

describe("flagship delivery and dispute", () => {
  it("matches the monitor's GTIN and flags a stranger", async () => {
    const r = await e.flagshipOrderRecord();
    const monitor = r.contract.items.find((i) => i.role === "monitor");
    if (!monitor?.gtin) throw new Error("monitor has no GTIN");
    expect(matchDelivery(r.contract.items, monitor.gtin).outcome).toBe(
      "matched",
    );
    const packet = e.disputePacket(r, [
      {
        gtin: "00812345000030",
        method: "typed",
        at: "2026-09-29T10:00:00Z",
        ledgerSeq: null,
      },
    ]);
    expect(packet.received[0]?.matched).toBeNull();
    const monitorFacts = packet.factsAtPurchase.find(
      (f) => f.sku === monitor.sku,
    );
    expect(monitorFacts?.facts.map((f) => f.label)).toContain("USB-C power");
  });
});
