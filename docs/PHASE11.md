# Phase 11 — Cartel screens

Every Phase 11 route is built. The flagship plan runs them all on the Zod fixtures through the real engine; screens with a table behind them also read Supabase through the visitor's own session (RLS).

## Data sources

| Screen | Flagship demo (`/plans/flagship`, order `CT-0926-0001`) | Real data |
| --- | --- | --- |
| `/new` | Home office template opens the demo plan | Any other brief inserts a `plans` row, then opens its requirements |
| `/plans/[id]/requirements` | `FLAGSHIP_REQUIREMENTS`; edits stay on the page | Latest `requirement_sets`; "Find plans" saves the next version |
| `/plans/[id]` | Existing workspace | Saved plans show "no plans yet" until stored plans are solved |
| `/plans/[id]/compare` | `solvePlans(FLAGSHIP_PROBLEM)`, exhaustive engine; `?budget=` / `?by=` re-solve, infeasible → conflict banner | — |
| `/plans/[id]/contract` | v7 signed, v8 before signing (`?review=1`), v8 signed | `contract_versions` + its `proof_reports` row; `awaiting_signature` mounts Phase 12's `SignContract` |
| `/plans/[id]/checkout` | v8 paid run and v7 trap run, both from `consentDiff` | `CheckoutPanel` against the Phase 13 API, now with the stepper |
| `/plans/[id]/diff/[diffId]` | `consentDiff(v7, dealTrap)` | — |
| `/orders`, `/orders/[id]` | v8 receipt; Evidence Pack JSON at `/orders/CT-0926-0001/evidence-pack` | `orders` |
| `/ledger/[planId]` | 13 events chained with `lib/ledger.ts` | `ledger_events` |
| `/mandates` | v7 mandate, fired and blocked | Phase 14's page: arm, cancel, outcomes |
| `/bench` | Five live attacks through `consentDiff` | Latest `bench_runs` row, if any |
| `/settings/signing` | — | Phase 12's register flow, plus Remove |
| `/explore`, `/search`, `/p/[id]`, `/compare`, `/kits/[slug]` | Demo catalog (`lib/demo-catalog.ts`) when the catalog database isn't connected, and always for `dm_…` IDs | `/api/search` stream, `loadProducts`, `kits`, fork API |

Pages served from fixtures carry a "Demo plan" or "Demo data" tag. Times the fixtures don't pin (plan creation, payment) are fixed demo values in `lib/flagship.ts`.

## Decisions

- **One engine path.** Contract, paused, guard, receipt and ledger views are built from `ApprovedState`s and `consentDiff` results, never typed in. The numbers ($896.05, $881.07, $870.37, 8 of 9 hard rules plus one waiver) come from the engine; the design's "12 of 12" was illustrative.
- **Ledger hashes match the database.** `lib/ledger.ts` reproduces `internal.ledger_hash` (UTC microsecond timestamps, Postgres `jsonb` text). "Verify chain" recomputes every hash in the browser.
- **Demo catalog sources.** Each demo product has GreatHub's listing (merchant, "Seller says") and a seeded spec sheet with the same values (source type `fixture`, manufacturer authority, per SDD §11.2). The receipt shown is the strongest agreeing source in the pack's authority order, so the Halden shows "USB-C power · 65 W · Manufacturer says".
- **Facets are recomputed** over de-duplicated results on the client (`buildFacets`), never summed across source chunks.
- **Trays live in `localStorage`** (`lib/tray-store.ts`): a per-browser scratchpad, not a plan.
- **Signed terms are read-only.** On a stored version the autonomy preset and mandate are shown, not editable: the passkey signs the stored body, so on-screen edits could otherwise differ from what is signed.
- **`ruleText` fixes:** role labels are capitalized, "USB-C cable cable power rating" reads "USB-C cable power rating", list operators say what they mean ("Dress fibers without wool"), and `between` reads "between 35.5 in and 36.5 in".

## Still open

- Drafting a contract version from a saved plan. Until then only versions created elsewhere can be signed here; demo contracts are fixtures and can't be signed.
- Streaming proof rows and guard steps: the Inspector and stepper react to outcomes, not per-row or per-step events.
- The refinement command bar (A4) and solving saved plans into baskets.
- Scan delivery (T15), the 62-scenario bench suite (Phase 16).
- Evidence drawer conflicts side by side (T11.4); conflicts show on the product page.
