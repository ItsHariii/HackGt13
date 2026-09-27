import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("react", async (orig) => ({
  ...(await orig<typeof import("react")>()),
  cache: <T>(fn: T) => fn,
}));

const f = await import("./flagship");
const { verifyChain } = await import("./ledger");

describe("flagship screens from the engine", () => {
  it("contract v7 is signable, waives chair comfort and arms the mandate", async () => {
    const c = await f.flagshipContract(7);
    expect(c.canSign).toBe(true);
    expect(c.economics.total).toBe("$896.05");
    expect(c.economics.max).toBe("$910.00");
    expect(c.rules.find((r) => r.id === "r_chair_comfort")).toMatchObject({
      status: "cant",
      waived: true,
    });
    expect(c.rules.filter((r) => r.status === "pass")).toHaveLength(8);
    expect(c.mandate?.text).toBe(
      "Execute when the Vireo U2727 is ≤ $320.00, before Mon Sep 28.",
    );
    expect(c.number).toBe("CT-HO-0926-07");
  });

  it("the deal trap pauses at the Cartel re-check only", async () => {
    const p = await f.flagshipPaused();
    expect(p.layers.map((l) => l.status)).toEqual([
      "pass",
      "pass",
      "pass",
      "fail",
    ]);
    expect(p.checkoutTotal).toBe("$881.07");
    expect(p.layers[3]?.detail).toBe("USB-C power 15 W < 65 W required");
    expect(p.changed?.rows.find((r) => r.failing)).toMatchObject({
      approved: "up to 90 W",
      current: "15 W",
    });
    expect(p.alternative.title).toMatch(/^Halden M27Q-USBC/);
    expect(p.alternative.hardPass).toBe(8);
  });

  it("v7 → v8 swaps the monitor and lowers the cap", async () => {
    const r = await f.flagshipRevision();
    const changed = r.lines.filter((l) => l.kind !== "ctx" && l.kind !== "gap");
    expect(changed.map((l) => l.kind === "gap" || [l.kind, l.label])).toEqual([
      ["del", "Monitor"],
      ["add", "Monitor"],
      ["del", "Webcam"],
      ["add", "Webcam"],
      ["del", "Delivered total"],
      ["add", "Delivered total"],
      ["del", "Maximum total"],
      ["add", "Maximum total"],
    ]);
  });

  it("the order and ledger agree on $870.37, and the chain verifies", async () => {
    const o = await f.flagshipOrder();
    expect(o.total).toBe("$870.37");
    const ledger = await f.flagshipLedger();
    expect(await verifyChain(ledger)).toEqual({
      ok: true,
      entries: ledger.length,
    });
    expect(ledger.filter((e) => e.blocked).map((e) => e.type)).toEqual([
      "execution.blocked",
    ]);
  });

  it("compare solves Plan A at $896.05 and turns a tight budget into a conflict", async () => {
    const ok = await f.flagshipCompare();
    expect(ok.status).toBe("ok");
    if (ok.status === "ok") expect(ok.plans[0]?.total).toBe("$896.05");
    const tight = await f.flagshipCompare({ budget: 800 });
    expect(tight.status).toBe("conflict");
    if (tight.status === "conflict") {
      expect(tight.actions.length).toBeGreaterThan(0);
      expect(tight.actions[0]?.label).toMatch(/^Raise budget \+\$/);
    }
  });
});

describe("sign gate in the contract page", async () => {
  const { signReady } = await import("./contract-view");
  it("needs every waivable rule ticked and no fails", async () => {
    const c = await f.flagshipContract(8);
    expect(signReady(c, new Set()).ready).toBe(false);
    expect(signReady(c, new Set(["r_chair_comfort"]))).toEqual({
      ready: true,
      reasons: [],
    });
    const failing = {
      rules: c.rules.map((r) =>
        r.id === "r_usb_pd" ? { ...r, status: "fail" as const } : r,
      ),
    };
    expect(signReady(failing, new Set(["r_chair_comfort"])).reasons).toEqual([
      "Monitor USB-C power ≥ 65 W fails.",
    ]);
  });
});

describe("guard runs", () => {
  it("v8 re-checks as identical and the trap run stops at the guard", async () => {
    const [paid, paused] = await f.flagshipGuardRuns();
    expect(paid?.steps.find((s) => s.label === "Diff")?.meta).toBe(
      "No changes",
    );
    expect(paused?.steps.find((s) => s.state === "failed")?.label).toBe(
      "Guard",
    );
  });
});
