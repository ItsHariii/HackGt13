import {
  ContractBody,
  contractHash,
  ProofReport,
  type ProofResult,
} from "@cartel/contracts";
import {
  FLAGSHIP_CONTRACT_V8,
  FLAGSHIP_REQUIREMENTS,
} from "@cartel/contracts/fixtures";
import {
  evaluate,
  evaluateResults,
  explain,
  extractJsonLd,
  fieldDef,
  packDefaults,
  signGate,
} from "@cartel/proof-engine";
import { describe, expect, it } from "vitest";
import {
  FLAGSHIP_PACKS,
  FLAGSHIP_T7,
  flagshipCheckout,
  flagshipOffers,
  flagshipStates,
  flagshipV7,
  flagshipV8,
  specFact,
} from "./fixtures";
import { homeOffice } from "./home-office";

const byId = (results: readonly ProofResult[], id: string) =>
  results.filter((r) => r.requirementId === id);
const one = (results: readonly ProofResult[], id: string) => {
  const found = byId(results, id);
  expect(found, id).toHaveLength(1);
  return found[0] as ProofResult;
};

describe("home-office flagship (SDD §16.1)", () => {
  it("contract v7 with the Vireo U2727: every hard rule passes except comfort, which is waived", async () => {
    const { report, contract } = await flagshipV7();
    ProofReport.parse(report);
    ContractBody.parse(contract);
    expect(report.summary).toEqual({
      hard: { pass: 8, fail: 0, unknown: 1 },
      preference: { met: 1, unmet: 0, unknown: 0 },
    });
    expect(one(report.results, "r_usb_pd")).toMatchObject({
      verdict: "pass",
      evidenceState: "source_stated",
      observed: { value: 90, unit: "W", qualifier: "up_to" },
      scope: { kind: "item", role: "monitor", offerId: "dm_off_vireo_u2727" },
      factIds: ["f_vireo_pd"],
    });
    expect(one(report.results, "r_chair_comfort")).toMatchObject({
      verdict: "unknown",
      reason: "subjective",
    });
    expect(one(report.results, "r_budget")).toMatchObject({
      verdict: "pass",
      evidenceState: "verified",
      observed: { amountMinor: 89_605, currency: "USD" },
    });
    expect(one(report.results, "r_delivery")).toMatchObject({
      verdict: "pass",
      evidenceState: "estimated",
      observed: "2026-09-28",
    });
    expect(contract.economics).toEqual({
      currency: "USD",
      merchandiseMinor: 81_500,
      shippingMinor: 2_400,
      taxEstimateMinor: 5_705,
      maxTotalMinor: 91_000,
    });
    expect(signGate(report, contract.waivers)).toEqual({
      ok: true,
      blockers: [],
    });
  });

  it("the Vireo U2727E fails on USB-C power", () => {
    const results = evaluateResults({
      ...flagshipCheckout({ now: FLAGSHIP_T7, monitor: "vireo_e" }),
      requirements: FLAGSHIP_REQUIREMENTS,
      packs: FLAGSHIP_PACKS,
      now: FLAGSHIP_T7,
    });
    expect(one(results, "r_usb_pd")).toMatchObject({
      verdict: "fail",
      reason: "not_satisfied",
      observed: { value: 15, unit: "W" },
      evidenceState: "source_stated",
    });
    expect(one(results, "r_monitor_4k").verdict).toBe("pass");
    const gate = signGate({ results }, [
      {
        requirementId: "r_chair_comfort",
        acceptedState: "unknown",
        reason: "subjective",
      },
    ]);
    expect(gate.ok).toBe(false);
    expect(gate.blockers).toEqual([
      {
        requirementId: "r_usb_pd",
        scope: expect.anything(),
        verdict: "fail",
        reason: "not_satisfied",
        waivable: false,
      },
    ]);
  });

  it("contract v8 reproduces the pinned FLAGSHIP_CONTRACT_V8, report hash and parent hash", async () => {
    const v7 = await flagshipV7();
    const v8 = await flagshipV8();
    expect(v8.contract).toEqual(FLAGSHIP_CONTRACT_V8);
    expect(v8.report.hash).toBe(FLAGSHIP_CONTRACT_V8.proof.reportHash);
    expect(FLAGSHIP_CONTRACT_V8.parentHash).toBe(
      await contractHash(v7.contract),
    );
    expect(
      v8.contract.economics.merchandiseMinor +
        v8.contract.economics.shippingMinor +
        v8.contract.economics.taxEstimateMinor,
    ).toBe(87_037);
    expect(one(v8.report.results, "r_usb_pd")).toMatchObject({
      verdict: "pass",
      observed: { value: 65, unit: "W" },
    });
  });

  it("without the comfort waiver, signing is blocked by a waivable unknown", async () => {
    const { report } = await flagshipV8();
    expect(signGate(report, [])).toEqual({
      ok: false,
      blockers: [
        {
          requirementId: "r_chair_comfort",
          scope: {
            kind: "item",
            role: "chair",
            offerId: "dm_off_kestrel_mesh",
          },
          verdict: "unknown",
          reason: "subjective",
          waivable: true,
        },
      ],
    });
  });

  it("an unconfirmed assumption is a preference, whatever its declared importance", async () => {
    const requirements = FLAGSHIP_REQUIREMENTS.map((r) =>
      r.id === "r_usb_pd"
        ? {
            ...r,
            provenance: {
              kind: "ai_inferred" as const,
              rationale: "MacBook",
              confirmed: false,
            },
          }
        : r,
    );
    const results = evaluateResults({
      ...flagshipCheckout({ now: FLAGSHIP_T7, monitor: "vireo_e" }),
      requirements,
      packs: FLAGSHIP_PACKS,
      now: FLAGSHIP_T7,
    });
    expect(one(results, "r_usb_pd")).toMatchObject({
      importance: "preference",
      verdict: "fail",
    });
    expect(
      signGate({ results }, [
        {
          requirementId: "r_chair_comfort",
          acceptedState: "unknown",
          reason: "subjective",
        },
      ]).ok,
    ).toBe(true);
  });

  it("explains results in attributed, template-generated sentences", async () => {
    const { report } = await flagshipV7();
    const say = (id: string) => {
      const r = one(report.results, id);
      const field = FLAGSHIP_REQUIREMENTS.find((q) => q.id === id)
        ?.field as string;
      return explain(r, {
        def: fieldDef(field, FLAGSHIP_PACKS),
        source: "Manufacturer",
      });
    };
    expect(say("r_usb_pd")).toBe(
      "USB-C power: Manufacturer says up to 90 W, which meets at least 65 W.",
    );
    expect(say("r_desk_width")).toBe(
      "Desk width: Manufacturer says 46.5 in, which meets at most 48 in.",
    );
    expect(say("r_chair_comfort")).toBe(
      "Chair comfort is subjective, so it can't be checked.",
    );
    expect(say("r_delivery")).toBe(
      "Latest delivery: Mon Sep 28 (estimate), which meets at most Mon Sep 28.",
    );
    expect(
      explain(one(report.results, "r_budget"), {
        def: fieldDef("basket.delivered_total", FLAGSHIP_PACKS),
        source: "GreatHub checkout",
        ageSeconds: 4,
      }),
    ).toBe(
      "Delivered total: $896.05 (Confirmed · GreatHub checkout · just now), which meets at most $1,000.00.",
    );
  });
});

describe("home-office roles and pairs", () => {
  const defaults = packDefaults(homeOffice, {
    budget: { amountMinor: 100_000, currency: "USD" },
    deadline: "2026-09-28",
  });
  const videoIn = (productId: string, ports: string[]) =>
    specFact(`f_${productId}_video`, productId, "monitor.video_in", ports);

  it("stamps pack defaults with pack_default provenance and stable IDs", () => {
    expect(defaults.map((d) => d.id)).toEqual([
      "d_home_office_budget",
      "d_home_office_deadline",
      "d_home_office_cable_pd",
      "d_home_office_dock_video",
      "d_home_office_roles",
      "d_home_office_chair_comfort",
    ]);
    expect(defaults[2]?.provenance).toEqual({
      kind: "pack_default",
      pack: "home-office",
      ruleId: "cable_pd",
    });
    expect(defaults[2]?.target).toEqual({ value: 65, unit: "W" });
  });

  it("requires a cable when the monitor takes USB-C, and a dock when it can't power the laptop", () => {
    const base = flagshipStates.v7();
    const withoutCable = {
      ...base,
      basket: {
        ...base.basket,
        lines: base.basket.lines.filter((l) => l.role !== "cable"),
      },
      facts: [
        ...base.facts,
        videoIn("dm_vireo_u2727", ["USB-C", "HDMI", "DisplayPort"]),
      ],
    };
    const requirements = [...defaults, ...FLAGSHIP_REQUIREMENTS];
    const results = evaluateResults({
      ...withoutCable,
      requirements,
      packs: FLAGSHIP_PACKS,
      now: FLAGSHIP_T7,
    });
    expect(one(results, "d_home_office_roles")).toMatchObject({
      verdict: "fail",
      observed: ["cable"],
      evidenceState: "source_stated",
    });

    const economy = flagshipCheckout({ now: FLAGSHIP_T7, monitor: "vireo_e" });
    const r2 = evaluateResults({
      ...economy,
      facts: [...economy.facts, videoIn("dm_vireo_u2727e", ["HDMI"])],
      requirements,
      packs: FLAGSHIP_PACKS,
      now: FLAGSHIP_T7,
    });
    expect(one(r2, "d_home_office_roles")).toMatchObject({
      verdict: "fail",
      observed: ["dock"],
    });
  });

  it("can't tell which roles are needed when the deciding fact is missing", () => {
    const base = flagshipStates.v7();
    const noCable = {
      ...base,
      basket: {
        ...base.basket,
        lines: base.basket.lines.filter((l) => l.role !== "cable"),
      },
    };
    const results = evaluateResults({
      ...noCable,
      requirements: defaults,
      packs: FLAGSHIP_PACKS,
      now: FLAGSHIP_T7,
    });
    // monitor.video_in isn't in the flagship facts, so the cable rule can't decide
    expect(one(results, "d_home_office_roles")).toMatchObject({
      verdict: "unknown",
      reason: "no_fact",
    });
  });

  it("checks dock ↔ monitor video with port aliases, and skips the pair when there is no dock", () => {
    const dock = (ports: string[]) => ({
      role: "dock",
      offer: {
        ...flagshipOffers.cable,
        id: "dm_off_dock",
        productId: "dm_dock",
        sku: "DOCK-1",
        title: "Dock",
      },
      facts: [specFact("f_dock_out", "dm_dock", "dock.video_out", ports)],
    });
    const run = (ports: string[] | null) => {
      const base = flagshipStates.v7();
      const d = ports ? dock(ports) : null;
      return evaluateResults({
        ...base,
        basket: d
          ? {
              ...base.basket,
              lines: [
                ...base.basket.lines,
                { role: "dock", offerId: d.offer.id, qty: 1 },
              ],
            }
          : base.basket,
        offers: d ? [...base.offers, d.offer] : base.offers,
        facts: [
          ...base.facts,
          ...(d?.facts ?? []),
          videoIn("dm_vireo_u2727", ["USB-C DP Alt", "DisplayPort 1.4"]),
        ],
        requirements: defaults.filter(
          (r) => r.id === "d_home_office_dock_video",
        ),
        packs: FLAGSHIP_PACKS,
        now: FLAGSHIP_T7,
      });
    };
    expect(run(["DisplayPort"])[0]).toMatchObject({
      verdict: "pass",
      scope: {
        kind: "pair",
        roles: ["dock", "monitor"],
        offerIds: ["dm_off_dock", "dm_off_vireo_u2727"],
      },
      observed: true,
    });
    expect(run(["HDMI 2.0"])[0]).toMatchObject({
      verdict: "fail",
      observed: false,
    });
    expect(run(null)).toEqual([]);
  });

  it("extracts facts from GreatHub JSON-LD with the pack's map", () => {
    const doc = {
      "@context": "https://schema.org",
      "@type": "Product",
      name: 'Vireo U2727 27" 4K USB-C Monitor',
      additionalProperty: [
        { "@type": "PropertyValue", name: "Screen size", value: "27 in" },
        { "@type": "PropertyValue", name: "Resolution", value: "3840x2160" },
        {
          "@type": "PropertyValue",
          name: "USB-C power delivery",
          value: "Up to 90W",
        },
        {
          "@type": "PropertyValue",
          name: "Video inputs",
          value: "USB-C, HDMI 2.0, DisplayPort",
        },
        // GreatHub adds this when an offer is a multipack (pack_size_shrink edits it).
        { "@type": "PropertyValue", name: "Pack size", value: "2" },
      ],
      width: { "@type": "QuantitativeValue", value: 61.2, unitCode: "CMT" },
      offers: { "@type": "Offer", price: "329.00", priceCurrency: "USD" },
    };
    expect(extractJsonLd(homeOffice, doc)).toEqual([
      {
        field: "desk.width",
        path: "width",
        raw: "61.2 cm",
        value: { value: 61.2, unit: "cm" },
      },
      {
        field: "monitor.diagonal",
        path: "additionalProperty[name=Screen size].value",
        raw: "27 in",
        value: { value: 27, unit: "in" },
      },
      {
        field: "monitor.resolution",
        path: "additionalProperty[name=Resolution].value",
        raw: "3840x2160",
        value: "4k",
      },
      {
        field: "monitor.usb_c_pd_watts",
        path: "additionalProperty[name=USB-C power delivery].value",
        raw: "Up to 90W",
        value: { value: 90, unit: "W", qualifier: "up_to" },
      },
      {
        field: "monitor.video_in",
        path: "additionalProperty[name=Video inputs].value",
        raw: "USB-C, HDMI 2.0, DisplayPort",
        value: ["USB-C", "HDMI 2.0", "DisplayPort"],
      },
      {
        field: "product.pack_size",
        path: "additionalProperty[name=Pack size].value",
        raw: "2",
        value: { value: 2, unit: "count" },
      },
      // The webcam map reads the same property; "3840x2160" isn't a webcam resolution.
      {
        field: "webcam.resolution",
        path: "additionalProperty[name=Resolution].value",
        raw: "3840x2160",
        value: null,
      },
    ]);
  });

  it("reports the same hash for the same inputs", async () => {
    const data = {
      ...flagshipStates.v7(),
      requirements: FLAGSHIP_REQUIREMENTS,
      now: FLAGSHIP_T7,
    };
    const a = await evaluate({ ...data, packs: FLAGSHIP_PACKS });
    const b = await evaluate({
      ...structuredClone(data),
      packs: FLAGSHIP_PACKS,
    });
    expect(a.hash).toBe(b.hash);
  });
});
