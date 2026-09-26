# Phase 4 implementation and verification

Implemented September 26, 2026 against SDD §7.3–§7.7, §8, §16.1, §22.1 and the Phase 4 checklist.

## Delivered

### `@proofcart/proof-engine` (depends only on `@proofcart/contracts`)

| Module | Contents |
|---|---|
| `decimal.ts` (exported as `decimal`) | Fixed-point bigint decimals (scale 10¹⁸, exact for every conversion factor), round-half-even and round-half-up |
| `units.ts` | Base units per dimension, exact conversion, `compareQuantity` with tolerance, orientation-aware `boxFits` |
| `parse.ts` | `parseQuantity`, `parseRange`, `parseBox`, `parseMeasure`. Deterministic grammar: qualifiers kept, never throws, `null` on anything ambiguous |
| `money.ts` | Integer minor units, currency-checked add/sum/compare, `applyRate` (banker's rounding by default, documented), `parseMoney` |
| `evidence.ts` | Lattice (`weakest`, `strongest`, `capState`, `derivedState`), `resolveFacts`: freshness, `maxState` and qualifier caps, and conflict resolution by the pack's authority order only |
| `fields.ts` | `FieldDef`, `Authority`, engine-owned `CORE_FIELDS` (`offer.*`, `basket.*`, `merchant.*`, `order.*`), durations |
| `verdict.ts` | `satisfies()` for all 12 operators; `judge()` implements weak-fail / strong-pass (SDD §7.4) |
| `view.ts` | Basket view: per-line fact resolution, item/basket derivations, totals from lines + merchant quotes (a quoted total is only compared), `basket.missing_roles` |
| `evaluate.ts` | `evaluateResults` (sync, for the solver), `evaluate` / `buildReport` (hashed report), `signGate`, `ENGINE_VERSION` |
| `pack.ts` | `definePack` (validated and frozen at load), `fieldDef`, `packDefaults`, `checkRequirements` |
| `consent.ts` | `consentDiff`, `classify` (presets + policy floor), `approvalItems` (signed items/economics computed the way the diff reads them back), `hardFields` |
| `explain.ts` | Reason-code templates plus value, target, money and date formatting |
| `jsonld.ts` | `resolveJsonLdPath`, `readAs`, `extractJsonLd` over a pack's `jsonLd` map (QuantitativeValue and UN/CEFACT unit codes supported) |
| `offer-facts.ts` | `offerFacts(offer, meta)`: checkout offer → the offer facts the engine reads |

### `@proofcart/rule-packs`

- `homeOffice`, `apparel`, `travel` (all `1.0.0`), `PACKS`, `packsFor(versions)`.
- `@proofcart/rule-packs/fixtures`: a DemoMart checkout builder, `approveCheckout`, the flagship timeline (`flagshipStates`, `flagshipV7`, `flagshipV8`), the wedding kit and the carry-on items.

## Verified locally

- proof-engine: 197 tests (2 skipped on purpose: `exists` has no "violating value" case). rule-packs: 45 tests. contracts: 113 tests. Typecheck and Biome are clean for all three.
- **T4.1:** 83 table-driven parser cases (quantities, ranges, boxes, hints and hostile input), all returning `null` rather than throwing.
- **T4.4:** every operator × {pass, weak-evidence unknown, strong fail, weak fail, no-fact/stale/conflict/subjective}, plus an exhaustive min-state × state check (invariant 4).
- **T4.8:** the flagship reproduces SDD §16.1 exactly: v7 total $896.05 (8 hard pass, comfort `unknown (subjective)` and waived); U2727 passes at "up to 90 W"; U2727E fails at 15 W; v8 total $870.37. `flagshipV8()` deep-equals `FLAGSHIP_CONTRACT_V8`.
- **T4.9:** chest fit 36.5 in vs 36 ± 0.5 passes as an estimate. The body chart gets +2 in ease and stays an estimate. The final-sale flip fails `returnable`. The exchange buffer passes on Oct 2 delivery (ready Oct 7) and fails on Oct 6 (ready Oct 11). Fiber and return-fee rules are checked.
- **T4.10:** Fieldnote passes and Atlas (10.8 in deep) fails 22 × 14 × 9. 20K mAh → 74 Wh estimate passes; 30K → 111 Wh fails; stated Wh or cell voltage is used instead of the 3.7 V assumption. Plug G and 100–240 V rules pass or fail as expected. 3.4 fl oz passes the 100 ml rule.
- **T4.11:** unchanged → `identical`. Webcam −$4 → `auto`, total $891.77. Deal trap → `block` via `floor.hard_pass_to_fail`, with $881.07 and no identity change. Seller rotation → `reapprove`. The final-sale flip → `block`. Balanced/Flexible/Strict tolerances, the max-total block, delivery earlier/later/past-deadline, and new subscriptions are all tested.
- **T4.12 (fast-check):** invariants 1, 2, 3, 4 and 5 over random flagship mutations, with a check that the generator actually reaches both the block case and the pass → unknown case. Invariant 7 is in `money.test.ts`, 9 in `evidence.test.ts`, 6 in contracts, and 8 belongs to the solver (Phase 5).
- **T4.14:** Biome override on `proof-engine`, `rule-packs` and `solver` sources (`noRestrictedImports`: fs, network, Supabase, AI SDKs and the impure workspace packages; `noRestrictedGlobals`: `fetch`, `XMLHttpRequest`, `WebSocket`, `process`, `performance`). A probe file confirmed it fires. Biome can't express `Date.now()` or `Math.random()`, so `purity.test.ts` also scans those sources for clock, randomness and I/O calls.

## Changes to `@proofcart/contracts`

- `Box` value, `{ dims: [n, n, n], unit }` with a length unit, added to the `Value` union. Bag sizes need all three axes at once for the orientation-aware check.
- `ReasonCode` gains `incomparable`, labelled "These values can't be compared", for different dimensions, currencies or shapes. It is never a failure.
- `FLAGSHIP_CONTRACT_V8` placeholders are now real values: `parentHash` is the hash of `flagshipV7()` and `proof.reportHash` is the engine's v8 report. `issuedAt`/`expiresAt` moved to 14:12:30/14:27:30, after the 14:10 deal trap, and `FLAGSHIP_V8_SIGNATURE.bodyHash` and `signedAt` follow. The AP2 snapshot was updated; only the expiries and the embedded body hash changed.

## Decisions and deviations

- **Facts are the single source of truth.** Price, delivery and terms are read from `offer.*` facts (`offerFacts()` builds them from an ACP offer), not from `Offer` fields directly. Shipping, tax and the merchant's total come from a `MerchantQuote`, and the engine sums the lines itself. A quoted total that disagrees with the sum makes the delivered total `unknown (total_mismatch)`.
- **Pair rules skip absent roles.** A pair requirement yields no result when either role is empty. Whether a role must be present is the separate `basket.missing_roles eq []` rule, fed by the pack's `required` / predicate roles and carrying the evidence state of the facts the predicate read. Without this, the default dock↔monitor rule would block every basket that has no dock.
- **Qualifiers.** `approx` caps at `estimated` by default. `up to`, `max` and `min` don't cap, because the canonical dataset passes "up to 90 W" as `source_stated`. A pack can set `qualifierCap` per field.
- **Dates.** A date-only value compares as the whole UTC day, so `lte 2026-09-28` accepts any time on the 28th. `before` is strict.
- **Waivers must name the reason.** `signGate` only accepts a waiver whose `requirementId` and `reason` both match the unknown result, so a waiver for "subjective" doesn't cover a later "stale".
- **Consent Diff inputs.** The contract carries only `reportHash`, so `consentDiff` takes the approved report and the approved checkout snapshot, and it refuses a report whose hash doesn't match. Verdicts are matched by requirement and role (not offer ID), so a swapped item compares with its predecessor.
- **Classification beyond the SDD §7.6 table:**
  - worsened return terms → `reapprove`
  - a delivery date that became unknown → `reapprove`
  - a removed subscription → `auto`
  - hard unknown → pass → `info`
  - a worsened preference → `info` (`reapprove` under Strict)
  - line-price, shipping and tax increases inherit the total's class
  - `requirement.materiality: "on_fact_change"` makes any fact change on that field `reapprove`
  - `always` and `on_verdict_change` behave the same, because every diff re-runs the proof

  Each change records its rule in `basis` (`floor.seller`, `balanced.total_increase`, …).
- **Change order** is stable and readable: verdicts, identity, economics (total first), terms, delivery, recurring, facts.
- **Signed item order** follows the basket's line order, the order the user reviewed. Results inside a report are in canonical order, so input order never changes `report.hash`.
- **Apparel:** fit is always an estimate (`garment.fit_chest` has `maxState: estimated`), matching §16.1. The exchange buffer assumes 2 days return transit and 3 days reship unless the merchant states `returns.*`. The wedding fixture ships to a clothing-tax-exempt state so the $242 basket fits the $250 budget.
- **Travel:** `toiletry.volume` allows 1 ml, because TSA's "3.4 oz (100 ml)" is 100.55 ml.
- **Freshness** fallbacks come from the pack (`fields[*].freshness`). Ingestion should set `freshUntil` per source class (SDD §11.4), which overrides them. Quotes default to 60 s.

## Known gaps

- Availability changes (out of stock) and pack-size changes have no `Change` kind in the contracts schema, so the diff only catches them when a requirement reads the field. Phase 16 ProofBench will need a small `Change` extension for these.
- When the live total can't be computed (stale quote), no economics change is emitted. The budget requirement's verdict (pass → unknown → `reapprove`) and the database guard's max-total check still cover it.
- The v7 parent (v6) isn't modeled, so `flagshipV7().contract.parentHash` is an all-zero placeholder.

Nothing is committed yet.
