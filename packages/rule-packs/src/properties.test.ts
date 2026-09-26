import { ConsentDiff, evidenceRank, type Fact } from "@cartel/contracts";
import {
  FLAGSHIP_REQUIREMENTS,
  VIREO_U2727_FACTS,
} from "@cartel/contracts/fixtures";
import {
  type CheckoutState,
  consentDiff,
  evaluate,
  evaluateResults,
} from "@cartel/proof-engine";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  approveCheckout,
  FLAGSHIP_PACKS,
  flagshipCheckout,
  flagshipV7,
} from "./fixtures";

/*
 * SDD §22.1 property invariants over the flagship checkout:
 *   1. consentDiff(x, x) = identical
 *   2. any hard pass → fail ⇒ block
 *   3. any hard pass → unknown ⇒ at least reapprove
 *   4. a hard requirement never passes below minStateToPass
 *   5. report.hash is stable under permutations of the input arrays
 * Invariants 6, 7 and 9 are covered in @cartel/contracts and the engine's
 * money and evidence tests; 8 belongs to the solver.
 */

const NOW = "2026-09-26T14:30:00Z";

type Mutation = {
  webcamMinor: number;
  vireoMinor: number;
  pdWatts: number;
  pdState: Fact["state"];
  seller: string;
  deskInches: number;
  chairDelivery: string;
  webcamFinalSale: boolean;
  deskStale: boolean;
};

const mutation: fc.Arbitrary<Mutation> = fc.record({
  webcamMinor: fc.integer({ min: 2_000, max: 8_000 }),
  vireoMinor: fc.integer({ min: 25_000, max: 40_000 }),
  pdWatts: fc.constantFrom(15, 60, 65, 90, 100),
  pdState: fc.constantFrom(
    "verified",
    "source_stated",
    "supported",
    "estimated",
    "unknown",
  ),
  seller: fc.constantFrom("dm_seller_1", "dm_seller_2"),
  deskInches: fc.constantFrom(46.5, 47.9, 48, 48.5, 52),
  chairDelivery: fc.constantFrom(
    "2026-09-26",
    "2026-09-27",
    "2026-09-28",
    "2026-09-29",
  ),
  webcamFinalSale: fc.boolean(),
  deskStale: fc.boolean(),
});

function mutate(m: Mutation, now = NOW): CheckoutState {
  const vireoFacts = VIREO_U2727_FACTS.map((f) =>
    f.field === "monitor.usb_c_pd_watts"
      ? {
          ...f,
          value:
            m.pdState === "unknown"
              ? null
              : { value: m.pdWatts, unit: "W" as const },
          state: m.pdState,
          ...(m.pdState === "unknown"
            ? { reason: "conflict" as const, conflict: true }
            : {}),
        }
      : f,
  );
  const live = flagshipCheckout({
    now,
    vireoMinor: m.vireoMinor,
    vireoSeller: m.seller,
    vireoFacts,
    webcamMinor: m.webcamMinor,
  });
  live.offers = live.offers.map((o) => {
    if (o.sku === "KS-MESH-TASK") return { ...o, deliveryBy: m.chairDelivery };
    if (o.sku === "PICA-1080" && m.webcamFinalSale)
      return {
        ...o,
        terms: { finalSale: true, returnWindowDays: 0, returnFeeMinor: 0 },
      };
    return o;
  });
  live.facts = live.facts.map((f) => {
    if (f.id === "dm_off_kestrel_mesh:delivery_by")
      return { ...f, value: m.chairDelivery };
    if (f.id === "dm_off_pica_1080:final_sale")
      return { ...f, value: m.webcamFinalSale };
    if (f.id === "f_desk_w") {
      return {
        ...f,
        value: { value: m.deskInches, unit: "in" as const },
        ...(m.deskStale ? { freshUntil: "2026-09-26T14:00:00Z" } : {}),
      };
    }
    return f;
  });
  return live;
}

describe("SDD §22.1 invariants", () => {
  it("1. consentDiff(x, x) = identical for any checkout x", async () => {
    await fc.assert(
      fc.asyncProperty(mutation, async (m) => {
        const x = mutate(m);
        const approved = await approveCheckout({
          contractId: "c_prop",
          version: 1,
          parentHash: null,
          planId: "p_prop",
          brief: "property",
          requirements: FLAGSHIP_REQUIREMENTS,
          checkout: x,
          packs: FLAGSHIP_PACKS,
          now: NOW,
          maxTotalMinor: 1_000_000,
          issuedAt: NOW,
          expiresAt: "2026-09-26T15:00:00Z",
        });
        const { diff } = await consentDiff(approved, x, FLAGSHIP_PACKS, NOW);
        expect(diff.classification).toBe("identical");
        expect(diff.changes).toEqual([]);
      }),
      { numRuns: 60 },
    );
  });

  it("2 & 3. hard pass → fail always blocks; hard pass → unknown always needs at least re-approval", async () => {
    const v7 = await flagshipV7();
    let sawBlock = 0;
    let sawUnknown = 0;
    await fc.assert(
      fc.asyncProperty(mutation, async (m) => {
        const { diff } = await consentDiff(v7, mutate(m), FLAGSHIP_PACKS, NOW);
        ConsentDiff.parse(diff);
        const hard = diff.changes.filter(
          (c) => c.kind === "verdict" && c.importance === "hard",
        );
        if (
          hard.some(
            (c) =>
              c.kind === "verdict" && c.before === "pass" && c.after === "fail",
          )
        ) {
          sawBlock++;
          expect(diff.classification).toBe("block");
        }
        if (
          hard.some(
            (c) =>
              c.kind === "verdict" &&
              c.before === "pass" &&
              c.after === "unknown",
          )
        ) {
          sawUnknown++;
          expect(["reapprove", "block"]).toContain(diff.classification);
        }
      }),
      { numRuns: 150 },
    );
    // the generator must actually reach both situations
    expect(sawBlock).toBeGreaterThan(0);
    expect(sawUnknown).toBeGreaterThan(0);
  });

  it("4. a hard requirement never passes below its minStateToPass", () => {
    fc.assert(
      fc.property(mutation, (m) => {
        const results = evaluateResults({
          ...mutate(m),
          requirements: FLAGSHIP_REQUIREMENTS,
          packs: FLAGSHIP_PACKS,
          now: NOW,
        });
        for (const r of results) {
          if (r.importance !== "hard" || r.verdict !== "pass") continue;
          const req = FLAGSHIP_REQUIREMENTS.find(
            (q) => q.id === r.requirementId,
          );
          expect(evidenceRank(r.evidenceState)).toBeGreaterThanOrEqual(
            evidenceRank(req?.evidence.minStateToPass ?? "verified"),
          );
        }
      }),
      { numRuns: 100 },
    );
  });

  it("5. report.hash is stable under permutations of every input array", async () => {
    const shuffle = <T>(xs: readonly T[], seed: number[]) =>
      xs
        .map((x, i) => [x, seed[i % seed.length] ?? 0, i] as const)
        .sort((a, b) => a[1] - b[1] || a[2] - b[2])
        .map(([x]) => x);
    await fc.assert(
      fc.asyncProperty(
        mutation,
        fc.array(fc.integer(), { minLength: 1, maxLength: 40 }),
        async (m, seed) => {
          const x = mutate(m);
          const base = await evaluate({
            ...x,
            requirements: FLAGSHIP_REQUIREMENTS,
            packs: FLAGSHIP_PACKS,
            now: NOW,
          });
          const permuted = await evaluate({
            ...x,
            basket: { ...x.basket, lines: shuffle(x.basket.lines, seed) },
            offers: shuffle(x.offers, seed.slice(1)),
            facts: shuffle(x.facts, [...seed].reverse()),
            requirements: shuffle(
              FLAGSHIP_REQUIREMENTS,
              seed.map((n) => -n),
            ),
            packs: FLAGSHIP_PACKS,
            now: NOW,
          });
          expect(permuted.hash).toBe(base.hash);
        },
      ),
      { numRuns: 60 },
    );
  });
});
