import {
  autonomyPolicy,
  ConsentDiff,
  type ContractBody,
} from "@cartel/contracts";
import {
  type ApprovedState,
  type CheckoutState,
  ConsentInputError,
  consentDiff,
} from "@cartel/proof-engine";
import { describe, expect, it } from "vitest";
import {
  FLAGSHIP_PACKS,
  FLAGSHIP_T_TRAP,
  FLAGSHIP_T_WEBCAM,
  FLAGSHIP_T7,
  flagshipCheckout,
  flagshipStates,
  flagshipV7,
  WEDDING_NOW,
  WEDDING_PACKS,
  weddingApproved,
  weddingCheckout,
} from "./fixtures";

const T = "2026-09-26T14:20:00Z";

async function diff(
  approved: ApprovedState,
  live: CheckoutState,
  now = T,
  packs = FLAGSHIP_PACKS,
) {
  const { diff: d, reproof } = await consentDiff(approved, live, packs, now);
  ConsentDiff.parse(d);
  return {
    d,
    reproof,
    summary: d.changes.map((c) => `${c.kind}:${c.class}:${c.basis}`),
  };
}

function withPolicy(
  a: ApprovedState,
  preset: "strict" | "balanced" | "flexible",
): ApprovedState {
  const contract: ContractBody = {
    ...a.contract,
    autonomy: autonomyPolicy(preset),
  };
  return { ...a, contract };
}

describe("Consent Diff: flagship events (SDD §16.1)", () => {
  it("an unchanged checkout is identical", async () => {
    const v7 = await flagshipV7();
    const { d } = await diff(v7, flagshipStates.v7(), FLAGSHIP_T7);
    expect(d.classification).toBe("identical");
    expect(d.changes).toEqual([]);
    expect(d.currentTotalMinor).toBe(89_605);
    expect(d.reproofHash).toBe(v7.report.hash);
  });

  it("event 1: webcam $49 → $45 is auto-accepted under Balanced; total $891.77", async () => {
    const { d, summary } = await diff(
      await flagshipV7(),
      flagshipStates.webcamDrop(),
      FLAGSHIP_T_WEBCAM,
    );
    expect(d.classification).toBe("auto");
    expect(d.currentTotalMinor).toBe(89_177);
    expect(summary).toEqual([
      "economics:auto:balanced.total_decrease",
      "economics:auto:balanced.price_decrease",
      "economics:auto:balanced.price_decrease",
    ]);
    expect(d.changes).toContainEqual(
      expect.objectContaining({
        kind: "economics",
        attribute: "unit_price",
        role: "webcam",
        beforeMinor: 4_900,
        afterMinor: 4_500,
      }),
    );
  });

  it("event 2, the deal trap: same SKU, $319 and 15 W → block; the total would have been $881.07", async () => {
    const { d, reproof } = await diff(
      await flagshipV7(),
      flagshipStates.dealTrap(),
      FLAGSHIP_T_TRAP,
    );
    expect(d.classification).toBe("block");
    expect(d.currentTotalMinor).toBe(88_107);
    expect(d.changes[0]).toEqual({
      kind: "verdict",
      requirementId: "r_usb_pd",
      importance: "hard",
      before: "pass",
      after: "fail",
      class: "block",
      basis: "floor.hard_pass_to_fail",
    });
    expect(d.changes).toContainEqual({
      kind: "fact",
      role: "monitor",
      field: "monitor.usb_c_pd_watts",
      before: { value: 90, unit: "W", qualifier: "up_to" },
      after: { value: 15, unit: "W" },
      hardField: true,
      class: "info",
      basis: "balanced.hard_fact_change",
    });
    // No identity change: the SKU, seller and merchant are the same.
    expect(d.changes.some((c) => c.kind === "identity")).toBe(false);
    expect(reproof.summary.hard.fail).toBe(1);
  });

  it("is block under every preset: the policy floor can't be relaxed", async () => {
    const v7 = await flagshipV7();
    for (const preset of ["strict", "balanced", "flexible"] as const) {
      const { d } = await diff(
        withPolicy(v7, preset),
        flagshipStates.dealTrap(),
        FLAGSHIP_T_TRAP,
      );
      expect(d.classification, preset).toBe("block");
    }
  });
});

describe("Consent Diff: identity and policy floor", () => {
  it("seller rotation needs re-approval", async () => {
    const { d, summary } = await diff(
      await flagshipV7(),
      flagshipCheckout({ now: T, vireoSeller: "dm_seller_7" }),
    );
    expect(d.classification).toBe("reapprove");
    expect(summary).toEqual(["identity:reapprove:floor.seller"]);
  });

  it("a SKU swap needs re-approval, and blocks when the swap fails a hard rule", async () => {
    const { d, summary } = await diff(
      await flagshipV7(),
      flagshipCheckout({ now: T, monitor: "vireo_e" }),
    );
    expect(summary).toContain("identity:reapprove:floor.sku");
    expect(summary).toContain("identity:reapprove:floor.gtin");
    expect(summary).toContain("verdict:block:floor.hard_pass_to_fail");
    expect(d.classification).toBe("block");
  });

  it("a total above the signed maximum blocks", async () => {
    const { d, summary } = await diff(
      await flagshipV7(),
      flagshipCheckout({ now: T, vireoMinor: 34_300 }),
    );
    // 815 + 14 = 829 merchandise, 24 shipping, 58.03 tax = 911.03 > 910
    expect(d.currentTotalMinor).toBe(91_103);
    expect(summary).toContain("economics:block:floor.max_total");
    expect(d.classification).toBe("block");
  });

  it("a new subscription needs re-approval", async () => {
    const live = flagshipStates.v7();
    live.offers = live.offers.map((o) =>
      o.sku === "PICA-1080" ? { ...o, recurring: "P30D" } : o,
    );
    const { summary } = await diff(await flagshipV7(), live, FLAGSHIP_T7);
    expect(summary).toEqual(["recurring:reapprove:floor.recurring"]);
  });

  it("a hard verdict pass → unknown needs re-approval (the fact went stale)", async () => {
    const v7 = await flagshipV7();
    const live = flagshipStates.v7();
    live.facts = live.facts.map((f) =>
      f.id === "f_desk_w" ? { ...f, freshUntil: "2026-09-26T14:02:20Z" } : f,
    );
    const { d, summary } = await diff(
      v7,
      live,
      FLAGSHIP_T7.replace("14:02:11", "14:02:40"),
    );
    expect(summary).toContain("verdict:reapprove:floor.hard_pass_to_unknown");
    expect(d.classification).toBe("reapprove");
  });
});

describe("Consent Diff: autonomy presets (SDD §7.6)", () => {
  // Webcam $49 → $52 raises the total by $3.21 (0.36%); → $59 by $10.70 (1.2%).
  const priced = (webcamMinor: number) =>
    flagshipCheckout({ now: T, webcamMinor });

  it("Balanced auto-accepts an increase within 2% and $5, and asks above it", async () => {
    const v7 = await flagshipV7();
    expect((await diff(v7, priced(5_200))).d.classification).toBe("auto");
    const { d, summary } = await diff(v7, priced(5_900));
    expect(d.classification).toBe("reapprove");
    expect(summary).toContain("economics:reapprove:balanced.total_increase");
  });

  it("Flexible allows up to 5% and $20; Strict re-approves any price change", async () => {
    const v7 = await flagshipV7();
    expect(
      (await diff(withPolicy(v7, "flexible"), priced(5_900))).d.classification,
    ).toBe("auto");
    expect(
      (await diff(withPolicy(v7, "strict"), priced(5_200))).d.classification,
    ).toBe("reapprove");
    expect(
      (await diff(withPolicy(v7, "strict"), priced(4_500))).d.classification,
    ).toBe("reapprove");
  });

  it("delivery: earlier is auto; later within the deadline is auto (Strict: re-approve); past it blocks", async () => {
    const v7 = await flagshipV7();
    const shifted = (deliveryBy: string) => {
      const live = flagshipStates.v7();
      live.offers = live.offers.map((o) =>
        o.sku === "KS-MESH-TASK" ? { ...o, deliveryBy } : o,
      );
      live.facts = live.facts.map((f) =>
        f.id === "dm_off_kestrel_mesh:delivery_by"
          ? { ...f, value: deliveryBy }
          : f,
      );
      return live;
    };
    expect(
      (await diff(v7, shifted("2026-09-26"), FLAGSHIP_T7)).summary,
    ).toEqual(["delivery:auto:policy.delivery_earlier"]);
    expect(
      (await diff(v7, shifted("2026-09-28"), FLAGSHIP_T7)).summary,
    ).toEqual(["delivery:auto:balanced.delivery_later_within_deadline"]);
    expect(
      (await diff(withPolicy(v7, "strict"), shifted("2026-09-28"), FLAGSHIP_T7))
        .d.classification,
    ).toBe("reapprove");
    const late = await diff(v7, shifted("2026-09-30"), FLAGSHIP_T7);
    expect(late.summary).toEqual([
      "verdict:block:floor.hard_pass_to_fail",
      "delivery:reapprove:floor.delivery_past_deadline",
    ]);
  });
});

describe("Consent Diff: apparel terms", () => {
  it("the final-sale flip blocks, even though the price dropped", async () => {
    const approved = await weddingApproved();
    const { d, summary } = await diff(
      approved,
      weddingCheckout({ finalSale: true }),
      WEDDING_NOW,
      WEDDING_PACKS,
    );
    expect(d.classification).toBe("block");
    expect(summary).toEqual([
      "verdict:block:floor.hard_pass_to_fail",
      "economics:auto:balanced.total_decrease",
      "economics:auto:balanced.price_decrease",
      "terms:reapprove:policy.terms_worsened",
      "terms:reapprove:policy.terms_worsened",
    ]);
  });
});

describe("Consent Diff: inputs", () => {
  it("refuses an approved report that isn't the one the contract names", async () => {
    const v7 = await flagshipV7();
    const tampered = {
      ...v7,
      report: { ...v7.report, hash: `sha256:${"f".repeat(64)}` },
    };
    await expect(
      consentDiff(tampered, flagshipStates.v7(), FLAGSHIP_PACKS, FLAGSHIP_T7),
    ).rejects.toThrow(ConsentInputError);
  });
});
