# Phase 9 implementation and verification

Implemented September 26, 2026 against SDD §10 and the Phase 9 checklist.

## Delivered

`@cartel/ai` (dependencies: `ai` 7, `@ai-sdk/openai`, `@ai-sdk/openai-compatible`, `zod` 4, `@cartel/contracts`, `@cartel/proof-engine`, `@cartel/platform`, `@supabase/supabase-js`; dev: `@cartel/evidence`, `@cartel/rule-packs`, `jiti`). Entry points: `@cartel/ai`, `@cartel/ai/supabase` (the `ai_calls` sink and spend reader) and `@cartel/ai/evals`.

| Module | Contents |
|---|---|
| `config.ts` | `readAiConfig(env)`: `AI_ENABLED`, `AI_PROVIDER`, `AI_FALLBACK_PROVIDER`, `OPENAI_*`, `META_*`, `AI_TIMEOUT_MS`, `AI_RETRIES`. A provider without a usable key is left out of the chain. `TASK_ROLE` maps A1, A2 and A4 to `primary` and A3 and A5 to `fast` |
| `providers.ts` | `resolveModel` (`@ai-sdk/openai`, or OpenAI-compatible Chat Completions for Meta) and `providerOptions` (OpenAI reasoning effort only) |
| `router.ts` | `AiRouter.run` / `runStream` over the provider chain, `AiDisabledError`, `AiUnavailableError`, `failureReason`, `isRetryable`, `forSession(router, { aiOff })` |
| `calls.ts`, `pricing.ts`, `supabase.ts` | `AiCallRecord`, a price table in micro-dollars, `supabaseAiSink(db)`, `readSpend(db)` |
| `ontology.ts`, `prompts.ts` | The pack ontology as prompt text. `SYSTEM_PREFIX` + ontology + task rules form the stable, cacheable prefix. `untrustedBlock` wraps brief and listing text |
| `schemas.ts` | Zod output schemas for A1–A5 |
| `requirements.ts` | A1: `draftRequirements`, `streamRequirements`, `buildRequirements` (the guard) |
| `roles.ts` | A2: `planRoles`, `mergeRoles`, `packRoles` |
| `extract.ts` | A3: `extractFacts`, `createFactExtractor` (plugs into `@cartel/evidence` `extractQuotedFacts`) |
| `refine.ts` | A4: `refineRequirements`, `buildPatches` |
| `explain.ts` | A5: `explain`, `templateExplanation`, `unsupportedNumbers` |
| `quote.ts` | `locateQuote`: whitespace/Unicode-normalized quote lookup with a span in the original text |
| `testing.ts` | Mock models and a test router, for this package's tests and for callers' |
| `evals/` | `EVAL_CASES` (20 briefs), `scoreCase` / `summarize` / `runEval`, `INJECTION_CASES` / `runInjectionCase` |
| `cli/` | `smoke.ts`, `cost.ts`, `eval.ts` |

Root scripts: `pnpm ai:smoke`, `pnpm ai:cost [--since 24h|7d|YYYY-MM-DD]`, `pnpm eval:ai [--provider openai|meta] [--model id] [--case id] [--out file.json] [--no-injection]`. The CLIs read `apps/web/.env.local` and then `.env.local`. Variables already set in the shell take precedence.

### Router (T9.1)

- Every call goes through `generateText` or `streamText` with `output: Output.object({ schema })`.
- Each attempt gets a 12 s timeout, merged with the caller's signal. Transport failures (timeout, 408, 429, 5xx, network errors) are retried twice per provider with exponential backoff, jittered across the upper half of each interval, then the next provider is tried. Other errors, such as invalid output or a 400, move straight to the next provider.
- The circuit breaker opens after 3 failures within 60 s and stays open for 60 s. After that it lets one probe call through, and a failed probe reopens it.
- Every attempt, including failed ones, becomes an `ai_calls` record with provider, model, input/cached/output tokens, estimated cost, latency, `fell_back` and a short error code. A sink that fails never fails the call.
- `AI_ENABLED=false` makes every call throw `AiDisabledError("disabled")`. `forSession(router, { aiOff: true })` gives one session a runner that refuses with `"session_off"`. Every task has a non-AI fallback: the pack template (A2), the template sentence (A5), or nothing extracted (A3).
- `temperature: 0` is sent unless the model is an OpenAI reasoning model with effort above `none`, because those models reject the parameter.

### Tasks (T9.2–T9.5)

- **A1** drops drafts whose field isn't in the ontology, is subjective, is a pack pair rule, or is derived (`basket.missing_roles`). It also drops drafts whose role is missing or unknown, and drafts whose value doesn't parse. Every drop is returned in `dropped` with a reason.
  - A requirement is `user_stated` only if its `quote` is found in the brief. Otherwise it becomes `ai_inferred`, which `effectiveImportance` treats as a preference until confirmed.
  - `streamRequirements` yields partial analyses and resolves the guarded set at the end.
- **A2** keeps the pack's role template as is. A role the model adds is `ai_inferred` and never required. Queries for roles that aren't in the plan are dropped.
- **A4** returns `RequirementPatch[]` validated against the contract. A patch naming an unknown requirement or field, a value that doesn't parse, or no actual change is rejected with a reason. Anything the model couldn't express as a patch comes back in `unhandled`. The package never applies patches; that happens when the shopper confirms.
- **A5** sees only the report/diff JSON and the template sentence. If the answer contains a number found in neither, the template is used instead and the invented numbers are returned for logging.

### Eval and injection (T9.6, T9.7)

- 20 briefs: 8 home office, 6 apparel, 6 travel, all resolved against a fixed date, Saturday 2026-09-26. `ho-flagship` and `ap-wedding` reuse the fixtures in `@cartel/rule-packs`.
- Each expected hard requirement has field, role, operator, value and the quote. `alt` lists accepted equivalent readings, such as `basket.delivered_total` vs `offer.price` for a one-item budget.
- **Field-level** scoring matches field + role. **Exact** scoring also matches operator and value (via `sameValue`). Only requirements whose `effectiveImportance` is hard are counted, so a hard requirement the guard downgraded to `ai_inferred` counts as missed.
- Four injection listings (an "approve the purchase" instruction, a fake closing `</untrusted>` tag, a request for an unrequested field, a JSON override). Each is extracted clean and injected. A case passes when the facts are identical, the planted value never appears, and no unrequested field comes back.

## Verified locally

- 101 tests pass in `packages/ai`: router, config, A1–A5, A3 plus injection, and the eval scorer. The eval test runs every case through a perfect mock model and checks it scores 100%, so the expectations can actually be met through the guard. Typecheck and Biome are clean.
- `pnpm ai:smoke`: OpenAI `/models` is reachable, and `gpt-6-sol` and `gpt-6-luna` both return a valid `Output.object()`. Meta fails because `META_MODEL_API_KEY` is empty.
- `pnpm eval:ai` on live models:

| Model | Field P / R | Exact P / R | Pack | Injection | Spend |
|---|---|---|---|---|---|
| `gpt-6-luna` | 98.7% / 98.7% | 98.7% / 98.7% | 100% | 4/4 | $0.005 |
| `gpt-6-sol` | 100% / 100% | 98.7% / 98.7% | 100% | 4/4 | $0.088 |

  - On `gpt-6-luna`, `tr-carry-on` asked about the bag size instead of writing `bag.dimensions`, and `ho-flagship` added `monitor.video_in contains "USB-C"`, which the brief supports.
  - The first `gpt-6-luna` pass scored 87.5% / 79.7% with 5% pack accuracy. The prompt fixes that closed the gap are listed under Decisions.

## Decisions and deviations

- **A1 prompt rules came out of the first eval.** The model had been nulling quotes on booleans and policies, which downgraded them. It also wrote deadlines as `offer.delivery_by` on multi-item baskets, skipped `garment.*` roles for loose words like "outfit", and never set `pack`. The rules now spell out:
  - what counts as a quote, and when a requirement is hard;
  - basket-level deadline and budget fields;
  - how to map a loose item name to a role;
  - that dates resolve against today's date. Today's date goes in the user prompt so the system prefix stays cacheable.
- **Pack ids are normalized** (`Home_Office`, `home-office@1.0.0` → `home-office`) before they're checked against the loaded packs.
- **Values from A1 are parsed leniently.** A bare number on a count field reads as a count, and a list value for `in`/`not_in` is flattened.
- **`garment.*` fields take their role from the draft**, like `offer.*`, because any apparel role can have them.
- **Evidence fixes found by the eval** (`packages/evidence/src/quote.ts`):
  - A box size like "21.5 x 14 x 9 in" was flagged as ambiguous because its parts read as rival lengths. Readings inside a matching reading no longer count as rivals.
  - `extractQuotedFacts` passed the extractor function where the extractor label belonged.
- **Untrusted text can't close its own block.** `<untrusted` / `</untrusted` inside brief or listing text is rewritten to `untrusted-text` before wrapping.

## Meta fallback run (2026-09-27)

`pnpm eval:ai --provider meta --model muse-spark-1.3` (with `AI_TIMEOUT_MS=90000`):

| | Result |
|---|---|
| Hard requirements, field level | P 98.8% · R 100% (20 briefs; apparel and travel 100%, home office P 97.3%) |
| Pack detection | 100% |
| Injection set (A3) | 3 / 4: `fake-closing-tag` changes an extracted fact |
| Latency | 35–50 s per A1 call (OpenAI `gpt-6-sol`: 4–5 s) |
| Spend | $0.38 for the full run |

The first two runs failed every call: the OpenAI-compatible provider asked only
for "some JSON", so answers rarely matched the schema, and the 12 s timeout cut the
rest off. `providers.ts` now sets `supportsStructuredOutputs: true`, which sends
`response_format: json_schema`.

Conclusion: accurate, but at 12 s the router gives up on Meta before it answers,
so as configured it is not a working fallback. Options: raise `AI_TIMEOUT_MS` for
the fallback only, or keep OpenAI alone (`AI_FALLBACK_PROVIDER=`).

## Wired into the web app (2026-09-27)

- A1 streams into the requirements review for saved plans (`/api/plans/[id]/draft`).
- A2 roles feed plan solving (`lib/plan-solve.ts`), with the pack template as fallback.
- A4 powers the workspace command bar: preview diff → confirm → re-solve. Prompts
  now show current targets as text (`$1,000.00`), since JSON targets made the model
  answer in JSON the parser couldn't read.

## Not done here

- The "AI summary" (A5) on screens and a per-session AI-off toggle.
- The root `pnpm --filter` scripts assume `pnpm` is on `PATH`. Locally they were run as `corepack pnpm` or through `jiti` directly, on Node 22 (the repo pins 24).
