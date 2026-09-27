import { FLAGSHIP_REQUIREMENTS } from "@cartel/contracts/fixtures";
import { signGate } from "@cartel/proof-engine";
import { FLAGSHIP_PACKS, flagshipV7 } from "@cartel/rule-packs/fixtures";
import { describe, expect, it } from "vitest";
import {
  buildWorkspace,
  conflictClaims,
  freshnessText,
  ruleText,
  sourceLabel,
} from "./workspace";

async function flagship(waived = true) {
  const v7 = await flagshipV7();
  const waivers = waived ? v7.contract.waivers : [];
  return {
    v7,
    view: buildWorkspace({
      planId: "flagship",
      title: "Home office",
      path: "/plans/flagship",
      planLabel: "Plan A · Balanced",
      requirements: v7.contract.requirements,
      checkout: v7.snapshot,
      report: v7.report,
      packs: FLAGSHIP_PACKS,
      waivers,
    }),
  };
}

describe("buildWorkspace (flagship v7)", () => {
  it("shows the basket and totals the engine proved", async () => {
    const { view } = await flagship();
    const [plan] = view.plans;
    expect(plan?.items.map((i) => [i.role, i.title, i.price])).toEqual([
      ["Desk", 'Birchline Compact Desk 46.5"', "$229.00"],
      ["Chair", "Kestrel Mesh Task Chair", "$189.00"],
      ["Monitor", 'Vireo U2727 27" 4K USB-C Monitor', "$329.00"],
      ["USB-C cable", "Loop USB-C Cable 100 W, 2 m", "$19.00"],
      ["Webcam", "Pica 1080p Webcam", "$49.00"],
    ]);
    expect(plan).toMatchObject({
      merchandise: "$815.00",
      shipping: "$24.00",
      tax: "$57.05",
      total: "$896.05",
      tierLabel: "Full Cartel checkout",
    });
    expect(plan?.items[0]).toMatchObject({
      spec: "Desk width 46.5 in",
      merchant: "GreatHub (test merchant)",
    });
  });

  it("reports the real hard-rule counts, with the comfort rule waived", async () => {
    const { view } = await flagship();
    expect(view.proof.headline).toBe("8 of 9 hard rules pass");
    expect(view.proof.sub).toBe("1 can't check (waived) · 1 estimate");
    expect(view.proof.ticks.filter((t) => t === "waived")).toHaveLength(1);
    const usb = view.proof.rows.find((r) => r.requirementId === "r_usb_pd");
    expect(usb).toMatchObject({
      rule: "Monitor USB-C power ≥ 65 W",
      kind: "pass",
      value: "up to 90 W",
      evidence: "GreatHub says",
    });
    const budget = view.proof.rows.find((r) => r.requirementId === "r_budget");
    expect(budget?.evidence).toMatch(/^Confirmed · GreatHub checkout · /);
    expect(
      view.proof.rows.find((r) => r.requirementId === "r_delivery"),
    ).toMatchObject({ kind: "est", evidence: "Estimate" });
    expect(
      view.proof.rows.find((r) => r.requirementId === "r_chair_comfort"),
    ).toMatchObject({ kind: "cant", value: "Waived" });
  });

  it("gates the contract exactly like signGate", async () => {
    for (const waived of [true, false]) {
      const { v7, view } = await flagship(waived);
      const gate = signGate(v7.report, waived ? v7.contract.waivers : []);
      expect(view.canReviewContract).toBe(gate.ok);
    }
    expect((await flagship(false)).view.proof.ticks).toContain("open");
  });

  it("labels requirements by provenance", async () => {
    const { view } = await flagship();
    const kinds = Object.fromEntries(
      view.requirements.map((r) => [r.id, [r.kind, r.strength]]),
    );
    expect(kinds).toMatchObject({
      r_budget: ["said", "HARD"],
      r_usb_pd: ["confirmed", "HARD"],
      r_cable_pd: ["default", "HARD"],
      r_chair_lumbar: ["assumed", "PREF"],
      r_chair_comfort: ["cant", "—"],
    });
  });

  it("builds evidence for the USB-C row from the listing text", async () => {
    const { view } = await flagship();
    expect(view.evidence.r_usb_pd).toMatchObject({
      verdict: "Pass",
      comparison: "up to 90 W ≥ 65 W",
      sourceText: "USB-C power delivery up to 90 W",
      claimedBy: "Merchant",
      extractor: "JSON-LD",
      extracted: "monitor.usb_c_pd_watts = up to 90 W",
    });
  });
});

describe("ruleText", () => {
  it("reads like the requirement", () => {
    const text = Object.fromEntries(
      FLAGSHIP_REQUIREMENTS.map((r) => [r.id, ruleText(r, FLAGSHIP_PACKS)]),
    );
    expect(text).toMatchObject({
      r_budget: "Delivered total ≤ $1,000",
      r_desk_width: "Desk width ≤ 48 in",
      r_monitor_4k: "Monitor resolution 4K",
      r_delivery: "Latest delivery by Mon Sep 28",
      r_no_substitutions: "No substitutions",
      r_chair_comfort: "Chair comfort",
    });
  });
});

describe("ruleText wording", async () => {
  const { WEDDING_REQUIREMENTS } = await import("@cartel/rule-packs/fixtures");
  const { apparel } = await import("@cartel/rule-packs");
  const { ruleText } = await import("./workspace");
  it("says what list operators mean and capitalizes roles", () => {
    const texts = WEDDING_REQUIREMENTS.map((r) => ruleText(r, [apparel]));
    expect(texts).toContain("Dress fibers without wool");
    expect(texts).toContain("Dress color navy");
    expect(texts.some((t) => /between 35\.5 in and 36\.5 in$/.test(t))).toBe(
      true,
    );
  });
});

describe("evidence conflicts and freshness", () => {
  it("lists every source side by side when they disagree, the used one first", async () => {
    const v7 = await flagshipV7();
    const used = v7.snapshot.facts.find(
      (f) => f.field === "desk.width" && f.subjectKind === "product",
    );
    if (!used) throw new Error("fixture changed");
    const rival = {
      ...used,
      id: "icecat-width",
      sourceId: "src_icecat",
      value: { value: 49, unit: "in" as const },
    };
    const checkout = {
      ...v7.snapshot,
      facts: [rival, ...v7.snapshot.facts],
      sources: {
        ...v7.snapshot.sources,
        src_icecat: { authority: "manufacturer" as const, name: "Icecat" },
      },
    };
    const claims = conflictClaims(
      checkout,
      used,
      "desk.width",
      undefined,
      v7.report.evaluatedAt,
    );
    expect(claims.map((c) => [c.source, c.used])).toEqual([
      [expect.any(String), true],
      ["Icecat", false],
    ]);
    // One source, one value: nothing to show.
    expect(
      conflictClaims(
        v7.snapshot,
        used,
        "desk.width",
        undefined,
        v7.report.evaluatedAt,
      ),
    ).toEqual([]);
  });

  it("says how long a fact stays fresh at the report's time", async () => {
    const v7 = await flagshipV7();
    const f = v7.snapshot.facts[0];
    if (!f) throw new Error("fixture changed");
    const at = "2026-09-26T12:00:00Z";
    expect(
      freshnessText({ ...f, freshUntil: "2026-09-26T15:00:00Z" }, at),
    ).toMatch(/^Fresh for 3/);
    expect(
      freshnessText({ ...f, freshUntil: "2026-09-26T10:00:00Z" }, at),
    ).toMatch(/^Stale by 2/);
    const { freshUntil: _drop, ...noExpiry } = f;
    expect(freshnessText(noExpiry, at)).toBe("No expiry");
  });
});

describe("sourceLabel", () => {
  it("names unnamed sources by who stated them, never by id", async () => {
    const v7 = await flagshipV7();
    const id = "9f20b0cb-04d9-4742-be53-1cfb22bd9dae";
    const checkout = {
      ...v7.snapshot,
      quotes: (v7.snapshot.quotes ?? []).map((q) => ({
        ...q,
        merchant: "greathub",
      })),
      sources: {
        [id]: { authority: "merchant" as const },
        "0b58f275-6e13-4b3e-9ac1-6c0fb11b15d9": {
          authority: "merchant_checkout" as const,
        },
      },
    };
    expect(sourceLabel(checkout, id)).toBe("GreatHub listing");
    expect(sourceLabel(checkout, "0b58f275-6e13-4b3e-9ac1-6c0fb11b15d9")).toBe(
      "GreatHub checkout",
    );
    expect(sourceLabel(checkout, "missing")).toBe("Source");
  });
  it("keeps a stored name", async () => {
    const v7 = await flagshipV7();
    const checkout = {
      ...v7.snapshot,
      sources: { s: { authority: "manufacturer" as const, name: "Icecat" } },
    };
    expect(sourceLabel(checkout, "s")).toBe("Icecat");
  });
});
