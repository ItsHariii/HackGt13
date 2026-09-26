# Phase 1 implementation and verification

Implemented September 26, 2026 against the SDD and Phase 1 checklist.

## Delivered

- pnpm 10.34.5 / Turborepo workspace; Node 24; strict TypeScript; Biome; Vitest projects; pinned lockfile.
- Next.js 16.3.6 app shells: Cartel on 3000 and GreatHub on 3001. Source Serif 4 / Geist fonts, paper and blueprint themes, accessible navigation, error/404 boundaries, shadcn-compatible button/config.
- Supabase Postgres 17 local configuration, required extensions, anonymous cookie sessions, server/browser/admin clients, request-ID proxies.
- Isolated owner-only Realtime test tables and private broadcasts with a browser measurement panel and labeled polling fallback.
- Server-only database readiness RPC and safe public JWKS export; both apps check DB, configuration, and JWKS reachability.
- Sentry 11 integration with restricted data collection, Pino redaction, and tagged local diagnostic endpoint.
- GitHub Actions quality and database jobs; local env templates and README.

## Verified locally

- Typecheck across all 14 app/package projects.
- Eight Vitest assertions covering invalid configuration, request IDs, secret-free JWKS export, and readiness failures/successes.
- Eight pgTAP permission assertions; SQL lint clean.
- Two-user Realtime smoke test: owner allowed, second user rejected, events inaccessible cross-user; five broadcasts in 42, 8, 7, 6, and 5 ms.
- Browser: desktop (1440 px), mobile (390 px), light/dark toggle, no horizontal overflow, 404, anonymous identity retained across reload, private broadcast received in 16 ms, both health endpoints HTTP 200, request-ID propagation, no runtime exceptions.
- Automated axe checks on Cartel light/dark and GreatHub: no WCAG A/AA violations detected. This is an automated scan, not a complete accessibility certification.
- Both production builds succeed with cloud credentials disabled. No app environment file was overwritten.

Port 3000 was occupied by an existing process. Browser verification used isolated temporary servers on 3100 and 3101 with local credentials and an ephemeral Ed25519 key, without changing that process or the app env files. Screenshots were inspected at desktop and mobile sizes.

## Remaining setup

Cloud Supabase linking and migrations; cloud Auth settings and Google OAuth credentials; Vercel projects, environment variables, previews, domains and HTTPS; hosted CI execution and required status-check rules; observed delivery of a Sentry event. These are left unchecked in TASKS.md.

The app workspace and catalog are presentation shells. Domain packages are intentionally empty typed module boundaries. Phase 2 tables/seeds, actual catalog ingestion, proof evaluation, contract signing, payments, and ProofBench are not implemented here.

## Implementation decisions

- Vitest 5 uses `test.projects`, replacing the deprecated workspace API.
- Sentry 11 imports `withSentryConfig` from `@sentry/nextjs/config` and uses `dataCollection` privacy settings instead of the removed `sendDefaultPii` option.
- Infrastructure lives in `0000_foundation.sql`; Phase 2 migration numbering can start at `0001` as planned.
- Supabase secret keys bypass RLS. A separate GreatHub key inside the same project does not itself constrain access to the GreatHub schema. Resolve scoped database access during the merchant data phase.
- Best Buy is disabled. Shopify Catalog data requires its own no-cache policy when ingestion is implemented; the SDD's generic catalog cache cannot apply to it.

## Re-verification (September 26, 2026, later)

Rechecked on Node 24.21 / pnpm 10.34.5 (the machine default is Node 22 with no pnpm, so use `.nvmrc`):

- `pnpm lint`, `pnpm typecheck` (14/14), `pnpm test` (8/8) and `pnpm build` (both apps) all pass.
- **Supabase cloud** (`nxagxozsyxmuuyqwvaby`): linked; only `0000_foundation.sql` applied and recorded in migration history (Phase 2 files `0001`–`0100` intentionally left pending until they pass `db reset` + `db test` locally). Anonymous sign-ins and manual identity linking enabled to match `config.toml`. Checked: `foundation_health` returns `true` with the secret key and 401 with the publishable key; anonymous sign-in returns an `is_anonymous` session. The Realtime smoke script is local-only by design and was not run against cloud.
- **Visa Acceptance sandbox**: HTTP-Signature auth works; a $1.00 test authorization on `4111 1111 1111 1111` returned `201 AUTHORIZED`. GreatHub's env now carries the same sandbox credentials.
- **Authorize.net sandbox**: `authenticateTestRequest` returns `Ok`.
- **Icecat**: token accepted; full spec sheets (19 feature groups) returned by brand + product code and by GTIN for covered brands (for example Lenovo). Brands outside Open Icecat return "not present", which the adapter must treat as `unknown`, not an error.
- **Local env gaps**: `AGENT_SIGNING_JWK` and `GRANT_SIGNING_JWK` are still placeholders (no `scripts/gen-keys.ts` yet, T0.4), and the HMAC/admin/webhook secrets are still `change-me` values. JWKS and health checks need real keys before Phase 8.
- AI provider switched from Anthropic to OpenAI (primary) with the Meta Model API as fallback; Best Buy replaced by UPCitemdb. See SDD §5, §10.4 and §11.2.
