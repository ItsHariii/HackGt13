# Phase 18 — Demo and submission

Phase 18 is the last phase in [TASKS.md](TASKS.md). The scripts and documents are built. What's left is mostly work for people on demo day, plus a few code gaps from earlier phases that the demo script depends on.

## Built

| Task | What | Where |
| --- | --- | --- |
| T18.1 | `pnpm demo:reset [--dry-run]`: GreatHub catalog reset, deletes the demo user's plans (keeps the passkey, the card and the ledger), `pnpm ai:warm`, a bench pre-run when Phase 16 adds it, and warms the "navy linen shirt" search cache | `scripts/demo-reset.mjs`, `scripts/demo-env.mjs`, `packages/ai/src/cli/warm.ts` |
| T18.2 | `pnpm demo:check [--visa]`: health, JWKS, demo pages, `PAYMENT_RAIL`, a $1.00 Visa sandbox authorization, the latest bench run, ledger chains, the demo user's passkey and card, and search. Prints the checks to do by hand. | `scripts/demo-check.mjs`, [DEMO.md](DEMO.md) §2 |
| T18.3 | The 3:00 run sheet: driver clicks, speaker lines, skip order, what to do when something breaks, and a rehearsal log | [DEMO.md](DEMO.md) §3–4 |
| T18.4 | Backup video recording notes | [DEMO.md](DEMO.md) §5 |
| T18.5 | Devpost draft: every section, the honesty notes, the screenshot list and the architecture diagram | [DEVPOST.md](DEVPOST.md) |
| T18.6 | README rewritten: pitch, architecture, setup, env vars, scripts, tests and bench | [README.md](../README.md) |
| T18.7 | Q&A assignment table, with corrections for the current build | [DEMO.md](DEMO.md) §6 |

Verified locally with `supabase start` and both apps in `next dev`. After the Chaos Panel "Flagship: deal trap", `demo:reset` restored U2727 from $319 to $329. It deleted only the demo user's plans, and another user's plan, the passkey, the card and every ledger event stayed. The search step cached GreatHub's 9 results. `demo:check` then passed every automated check except the HTTPS warnings, which are expected on localhost. `--visa` without credentials correctly reports a failure instead of passing. `biome ci`, `pnpm typecheck` and `pnpm test` (832 tests) are green.

## Needed before judging

### Configuration (whoever owns production)

- [ ] Create `.env.demo` at the repo root (gitignored) pointing at production: `CARTEL_URL`, `GREATHUB_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `CHAOS_ADMIN_TOKEN`, `DEMO_USER_EMAIL` (or `DEMO_USER_ID`), `PAYMENT_RAIL`, `OPENAI_API_KEY`, and the `VISA_ACCEPTANCE_*` sandbox keys for `--visa`. The template is in [DEMO.md](DEMO.md) §1.
- [ ] Create the demo user in production. Sign in once on the demo laptop, register the passkey at `/settings/signing`, and enroll the sandbox card at `/settings/payment`.
- [ ] Apply all migrations to the cloud project (PHASE9 notes that `ai_calls` was missing there).
- [ ] Run `pnpm demo:reset --dry-run`, then `pnpm demo:reset`, then `pnpm demo:check --visa`. Everything should be ✓.

### People

- [ ] Assign the speaker and the driver. Fill in the names in [DEMO.md](DEMO.md) §4.
- [ ] Three timed rehearsals, each after `pnpm demo:reset`, recorded in the rehearsal log (T18.3).
- [ ] Record the backup video in one take, add captions, upload it unlisted, and keep a local copy (T18.4).
- [ ] Take the screenshots in [DEVPOST.md](DEVPOST.md) on production, and render the Mermaid diagram to a PNG (T18.5).
- [ ] Fill in the Devpost links: the live app, the repo, the video (T18.5).
- [ ] Q&A drill: two questions each, out loud (T18.7).
- [ ] 30 minutes before judging: the checks by hand in [DEMO.md](DEMO.md) §2 (Touch ID on the production domain, the Chaos Panel window, reduced motion off, sound muted, hotspot).
- [ ] Run `pnpm demo:reset` within 10 minutes of going on stage, because the search cache lasts 10 minutes.
- [ ] Submit by H+35 and screenshot the confirmation (T18.8).

### Code gaps the demo script depends on (earlier phases)

The run sheet works around these, and [DEMO.md](DEMO.md) §3 says what is live and what comes from fixtures. Closing any of them makes the demo more live. When one closes, update DEMO.md §3, the DEVPOST.md honesty notes and the Q&A corrections.

- **Contract drafting from a saved plan (T11.6).** Until this lands, the flagship v7 and v8 are fixtures and can't be signed live. Present them as "signed earlier" instead of performing Touch ID.
- **A1 brief streaming and the AI-off toggle (PHASE9 "Not done here").** Requirements don't stream in, and the "flip AI off" answer to judges can't be shown. `pnpm ai:warm` only primes the provider cache and checks the key.
- **The ProofBench suite (Phase 16).** Don't say "62/62" until a `bench_runs` row exists. Once `@cartel/bench` has a `bench` script, `demo:reset` runs it automatically.
- **Streaming proof rows and guard steps (T11.3, T11.7).** The Inspector and the stepper react to outcomes, not to per-row events.
- **Hardening (Phase 17).** Security headers, rate limits, the RLS audit, and the accessibility, mobile and copy passes are still open.

## Notes

- `demo:reset` deletes `plans` rows through the secret key, and contracts, runs, orders and mandates cascade. `ledger_events` has no foreign key to `plans` and is append-only by design, so a deleted plan's events stay (unreadable through RLS).
- `demo:check` reads `PAYMENT_RAIL` from the local environment, not from Vercel. Confirm the Vercel value by hand.
- The scripts load env in this order, and earlier values win: the shell, `.env.demo`, `apps/web/.env.local`, `apps/greathub/.env.local`.
