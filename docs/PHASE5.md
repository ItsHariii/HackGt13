# Phase 5 implementation and verification

Implemented September 26, 2026 against SDD §9, §22.1 (invariant 8), §23 and the Phase 5 checklist.

## Delivered

`@proofcart/solver` (dependencies: `@proofcart/contracts`, `highs` 1.15.3; dev: `fast-check` 4):

| Module | Contents |
|---|---|
| `types.ts` | `SolverProblem` (roles, merchants, candidates, incompatible pairs, `BasketLimits`, preference weights, objective weights λ/μ), `Plan`, `PlanTotals`, `PlanTradeoff`, `ConflictSet`, `Relaxation`, `SolveResult` |
| `problem.ts` | `compile()`: validates the input and indexes it once per solve (`SolverInputError` on unknown roles or merchants, duplicate IDs, bad prices, dates, scores or weights). `deliverable()` |
| `evaluate.ts` | Exact ground truth for both engines: `taxMinor` (half-even), `totalsOf`, `objectiveOf`, `feasible`. `Cut` (`diverse` / `exclude`) and `satisfiesCut` |
| `model.ts` | `buildModel()`: the §9.1 MILP as CPLEX LP text. Returns `null` when a required role has no offer that can arrive in time |
| `highs.ts` | `loadHighs()` (lazy WASM load, cached, retried after a failure), `solveMilp()` (HiGHS plus a re-check against exact totals), `SolverEngineError` |
| `exhaustive.ts` | `solveExhaustive()` with budget pruning. Eligible up to 6 roles × 12 candidates (`EXHAUSTIVE_MAX_*`) |
| `plans.ts` | `topSelections()` (Plans A, B, C… via diversity cuts), `buildPlans()`, `tradeoffAgainst()` |
| `conflict.ts` | `findConflict()`: a deletion filter over the basket limits, then a bisection per member for the smallest relaxation |
| `requirements.ts` | `limitsFromRequirements(requirements, currency)`: hard basket requirements → `BasketLimits`, plus the `unmodeled` ones |
| `index.ts` | `solvePlans(problem, { k = 3, engine = "auto" })`. `auto` uses HiGHS and falls back to the exhaustive engine when the WASM can't load and the instance is small enough |
| `__fixtures__/home-office.ts` | `FLAGSHIP_PROBLEM` (the §16.1 catalog under contract v7) and `BUDGET_MONDAY_PROBLEM` (the T5.5 fixture) |

### The model (SDD §9.1)

- `x_i ∈ {0,1}` per candidate, `m_k ∈ {0,1}` per merchant, integer tax `t ≥ 0` in minor units.
- Objective, to maximize: `Σ (w·score_i − λ·line_i)·x_i − Σ (λ·ship_k + μ)·m_k − λ·t`.
  - Defaults: λ = 0.002 points per dollar, μ = 0.05 per merchant.
  - The LLM supplies only `w`.
- Constraints:
  - `Σ_{i∈r} x_i = 1` for a required role, or `≤ 1` for an optional one.
  - `x_i ≤ m_{merchant(i)}` links each item to its merchant.
  - `x_a + x_b ≤ 1` for each incompatible pair.
  - `Σ m_k ≤ maxMerchants`.
  - Tax: `t ≥ rate·merchandise − 0.5`.
  - Budget: `merchandise + shipping + t ≤ budget`.
  - The no-good cuts.
- Tax is on merchandise only, at `taxRateBps` (the seed's `rateBps: 700`), which matches $815.00 → $57.05.
- HiGHS runs with `mip_rel_gap = 0` and `random_seed = 0`. The default 0.01% gap could return a different Plan A than the exhaustive engine does.

## Verified locally

- 20 solver tests pass. Typecheck is clean, Biome (including the T4.14 purity override) is clean, and `purity.test.ts` passes for `solver`.
- **T5.1:** HiGHS WASM loads in Node and solves a toy MILP to its optimum (objective 3, `x = 1`).
- **T5.2:** the LP text contains every constraint family. A Tuesday offer never enters a Monday-deadline model. A required role with nothing deliverable is reported as infeasible without calling HiGHS. Malformed input throws `SolverInputError`.
- **T5.3:** both engines produce the same plans on `FLAGSHIP_PROBLEM`.
  - **Plan A** is the canonical basket (Birchline, Kestrel, Vireo U2727, Loop, Pica): $815.00 + $24.00 + $57.05 = **$896.05**, latest delivery Mon Sep 28.
  - **Plan B** saves $42.80 but gives up lumbar.
  - **Plan C** gets the standing desk but also gives up lumbar.
  - Every later plan keeps at most |S| − 2 of each earlier plan's picks, and objectives never increase from A to C.
- **T5.4 (fast-check, invariant 8):** 1,000 random instances per run, three runs, no failures. Each instance has 1–4 roles (some optional, qty 1–3), up to 16 candidates, 1–3 merchants, tax rates of 0 / 7 / 8.25 / 10 / 50%, missing delivery dates, incompatible pairs, and any mix of the three limits.
  - The generated mix was 512 feasible and 488 infeasible instances. The infeasible ones had conflicts of 0, 1, 2 and 3 members.
  - HiGHS and the exhaustive engine always agree on feasibility. Their Plan A objectives match within tolerance (see Decisions), and their conflict sets and relaxations are identical.
  - Every plan HiGHS returns passes the exact `feasible()` check.
- **T5.5:** `BUDGET_MONDAY_PROBLEM` ($900 budget, arrive by Monday) returns the conflict `{budget, delivery}` from both engines:
  - relax the budget by **+$84.00**, to $984.00 (Birchline, Kestrel, Aster at $411.20, Loop, Pica, all arriving Monday), or
  - move delivery to **2026-09-30**, a Wednesday (the Vireo basket at $896.05).
  - A third limit that doesn't conflict (`maxMerchants: 1`) is correctly left out of the set. A required role with no candidates is reported in `emptyRoles`.
- **T5.6:** 8 roles × 15 candidates × 3 merchants, with all three limits binding and two incompatible pairs. The top 3 plans come back in a **p50 of 38 ms** (9 warm runs, range 36–65 ms) against the 300 ms target. The test asserts p50 < 300 ms.

## Decisions and deviations

- **A role picks one offer and buys it `qty` times.** SDD §9.1 writes `Σ_c x[r,c] = q_r` over binaries, which would pick q_r *different* products for one role (two different chairs). Here `line_i = price × qty` and each role takes one pick.
- **Exact money beats the linearization.** The MILP's tax row rounds half down, but money everywhere else is half-even (`applyRate`). Every MILP answer is therefore re-checked with integer totals. A basket that breaks the budget only by that half cent is excluded with an exact no-good cut and the model is solved again. Up to 25 retries are allowed, then `SolverEngineError`.
- **Two kinds of cut.**
  - `diverse` is the SDD cut `Σ_{x∈S} x ≤ |S| − 2`. A one-pick plan only has to change (`≤ |S| − 1`), and an empty plan needs any pick at all.
  - `exclude` removes exactly one basket (`Σ_S x − Σ_{¬S} x ≤ |S| − 1`), so it never removes a superset along with it.
- **The conflict set is irreducible.** SDD §9.2 says "drop each one in turn; those whose removal restores feasibility form the set". Read literally, that gives an empty set when two independent conflicts exist. The implementation runs the standard deletion filter instead: a limit leaves the set if the rest stays infeasible without it. Each member's relaxation varies that one limit and keeps every other original limit in place:
  - budget: integer bisection up to the priciest possible basket
  - delivery: bisection over the candidates' later delivery dates
  - merchant count: bisection over merchant counts
- **Agreement tolerance.** HiGHS proves optimality to about 1e-7. The property test therefore treats objectives within 1e-6 points (about $0.0005 at the default λ) as ties, plus one cent of λ for the half-cent tax case. The first property run found a 1e-9 disagreement caused by a 6.6e-9 score. That was solver precision, not a bug.
- **Tradeoff labels are structured, not copy.** Each term (cost `savesMinor`, `preference` Δscore, `merchants` fewer) is valued in objective points. A plan's tradeoff is its largest gain and largest loss against Plan A. Wording belongs to the UI (`contracts/copy.ts`). Plan A's tradeoff is `null` ("Best overall").
- **Unknown delivery never meets a deadline.** `r_delivery` needs at least `estimated`, so an offer without `deliveryBy` is excluded whenever a delivery limit is set.
- **`limitsFromRequirements`** uses `effectiveImportance`, so an unconfirmed AI assumption never becomes a limit. When several requirements bound the same limit, the tightest wins. It reads `before` as strict: the latest allowed date is the day before. Hard basket rules it can't model (another currency, other fields) come back in `unmodeled` for the proof engine to check on each plan. `basket.merchant_count` is a new field name that no pack defines yet.
- **Purity.** The solver does no I/O of its own. `import("highs")` loads the WASM through the package's own loader, which the purity lint and test allow. The exhaustive engine is the fallback if the WASM can't load (SDD §26: "Solver WASM bundling problems").

## Not done here

- HiGHS in the browser (optional in T5.1). The solver is meant to run server-side from `solvePlans(planId)`.
- The glue from the proof engine to the solver: turning `evaluateResults` verdicts into candidate lists and preference `scores`, and writing `solver_runs`/`baskets`. That belongs to the Phase 11 server action.
- When `apps/web` first imports the solver, it will likely need `serverExternalPackages: ["highs"]` in `next.config.ts` so the WASM isn't bundled.
- The perf number comes from a local run on Node 22 (the repo pins 24). It hasn't run in CI yet.

Nothing is committed yet.
