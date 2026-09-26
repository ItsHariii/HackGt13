# Phase 3 implementation and verification

Implemented September 26, 2026 against SDD §7, §8.4, §12 and the Phase 3 checklist.

## Delivered

`@proofcart/contracts` (dependencies: `zod` 4, `canonicalize` 5; dev: `fast-check` 4):

| Module | Contents |
|---|---|
| `primitives.ts` | `EvidenceState` (+ `evidenceRank`), `ReasonCode`, `Verdict`, `Hash`, `FieldRef`, `Money`, `Unit` (+ `UNIT_DIMENSION`), `Quantity`, `Range`, `Value`, `HttpUrl` |
| `requirement.ts` | `Requirement`, `Provenance`, `Operator`, `RequirementPatch`, `effectiveImportance()` (unconfirmed AI assumptions evaluate as preferences) |
| `catalog.ts` | `Fact`, `Offer`, `ReturnTerms`, `CheckoutTier`, `Basket` |
| `proof.ts` | `ScopeRef`, `ProofResult`, `ProofReport`, `summarize()` |
| `contract.ts` | `ContractBody`, `ContractItem`, `Economics`, `Waiver`, `AutonomyPolicy` (+ `AUTONOMY_PRESETS`), `Mandate`, `ContractSignature`, `ScopedPaymentGrant`, `signingChallenge()` |
| `consent.ts` | `Change`, `ClassifiedChange`, `ConsentDiff`, `maxSeverity()` |
| `hash.ts` | `canonicalize()`, `sha256Hex()`, `hashJson()`, `contractHash()`, `reportHash()`, `factsDigest()`, `requirementSetHash()` |
| `ap2.ts` | `toAp2(contract, signature)`, `toMajor()` |
| `copy.ts` | `evidenceLabel()`, `verdictLabel()`, `provenanceLabel()`, `reasonLabel()`, `classificationLabel()`, `changeClassLabel()`, `formatAge()` |
| `fixtures/` (`@proofcart/contracts/fixtures`) | The SDD §16.1 flagship: brief, requirements, contract v8, the facts each item relied on, and the Vireo U2727 before and after the deal trap. Hashes are pinned by tests. |

## Verified locally

- 98 contracts tests pass (106 in the workspace), along with `biome ci`, the typecheck across all 14 projects, and both app builds.
- RFC 8785: the §3.2.2 and §3.2.3 vectors and 24 Appendix B number vectors pass. NaN, Infinity, `undefined` and lone surrogates are rejected.
- Property tests (fast-check): JCS and `hashJson` are stable under key reordering, and `JCS(parse(JCS(x))) = JCS(x)` (SDD §22.1 invariant 6).
- `factsDigest` is order-independent and unchanged by a refresh that returns the same claims. It changes on the same-SKU deal-trap edit (90 W → 15 W) and when only the evidence state or conflict flag changes.
- Flagship v8 parses. Economics come to $870.37 delivered with a $885.00 maximum. Every quote span points back into the brief, and the item digests, requirement-set hash and contract hash are pinned.
- AP2 snapshot: display items add up to the $870.37 total. Tax is marked `pending`.
- The copy test checks every label combination against the SDD §17.3 banned words.

## Decisions and deviations from the SDD text

- **Strict objects everywhere.** Unknown keys are rejected rather than stripped. Otherwise a smuggled field could sit in a stored body without being covered by the hash that was signed.
- **Cross-field checks live in the schemas.** Examples: `pair` scope requires `pairRole`; `weight` is allowed on preferences only; merchandise must equal the sum of the items; approved total ≤ `maxTotalMinor`; only version 1 has no `parentHash`; a mandate can't outlive its contract; a fact derived under an assumption is capped at `estimated`; a report's `summary` must match its results; a diff's `classification` must equal its most severe change; grants expire within 600 s.
- **`ProofResult.target` is `{ op, value: Value }`.** SDD §8.4 flattens the quantity (`{ op, value: 65, unit: "W" }`), which doesn't work for money, date and list targets. Results also carry the effective `importance` so the summary can be recomputed from the report alone.
- **`ContractItem` adds `title`, `terms` and an optional `recurring`/`variant`.** The Consent Diff's `termsChanges`/`recurringChanges` (SDD §7.7) and the AP2 display items need them, and they must be under the signature.
- **`ConsentDiff` adds `schema`, `contractHash` and `evaluatedAt`.** Each classified change records the policy rule that decided it in `basis`, for example `floor.hard_pass_to_fail`.
- **`factsDigest` covers claims, not provenance.** It hashes `{field, value, state, conflict}` and leaves out fact IDs, sources and timestamps. A refresh therefore isn't flagged as a fact change, which Strict mode would otherwise turn into a re-approval.
- **`requirementSetHash`** is `hashJson` over the requirements sorted by ID. The SDD didn't define it.
- **AP2.** Field names were checked against the AP2 Python SDK models (`ap2.models.mandate`, `payment_request`) on 2026-09-26. AP2 carries `user_authorization` on `PaymentMandate`, which ProofCart doesn't issue. The export therefore returns `user_authorization` (base64url JSON of the WebAuthn assertion and body hash) next to `{ intentMandate, cartMandate }`. `merchant_authorization` is `null`, because only the merchant can sign cart contents. Amounts are W3C decimal major units, using ISO 4217 exponents.
- **`evidenceLabel(state, source, ageSeconds, reason?)`.** The optional `reason` makes an `unknown` read "Sources disagree" when it's a conflict. A `verified` value without an age reads "{Source} says", never "Confirmed".

## Placeholders

- In the fixture, `proof.reportHash` and `parentHash` are all-zero hashes until the Phase 4 engine produces the v8 report and the v7 body is modeled.
- `FLAGSHIP_V8_SIGNATURE` has the right shape, but its bytes are not a real WebAuthn assertion. Phase 12 signing tests generate their own.

## Not done here

T0.3's team schema-freeze review hasn't happened. These schemas are now the v0 contract for the other lanes to review. Nothing is committed yet.
