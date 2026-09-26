# Cartel

Cartel puts explicit requirements, inspectable evidence, and an exact approval between a shopping decision and a payment. This repository currently implements the **Phase 1 foundation** from [the task list](docs/TASKS.md): two app shells, a typed workspace, Supabase identity and a private Realtime spike, health checks, observability hooks, and CI. Shopping, proof evaluation, payment execution, and domain schemas belong to later phases.

## Run the app shells

Use Node 24 (`.nvmrc`) and pnpm 10.34.5. If needed, run `nvm install`, `nvm use`, and `npm install -g pnpm@10.34.5`.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

- Cartel: http://localhost:3000
- GreatHub: http://localhost:3001
- Realtime test panel: http://localhost:3000/foundation

The shells work without credentials. The test panel reports missing configuration; health returns HTTP 503 until its real dependencies are ready. Fonts are downloaded by `next/font` at build time and then served by the apps.

If port 3000 is occupied, run each app separately with `pnpm --filter @cartel/web exec next dev --port 3100` and `pnpm --filter @cartel/greathub exec next dev --port 3101`. Update the local base/JWKS URLs accordingly.

## Run local Supabase

Start Docker Desktop, then:

```sh
pnpm db:start
pnpm exec supabase status
```

Studio is at http://127.0.0.1:54323; local email is at http://127.0.0.1:54324. The local stack uses Postgres 17. The `0000_foundation.sql` migration enables the required extensions and creates isolated `foundation_*` tables for the spike. Phase 2 starts at `0001` and supplies the actual shopping data model.

If app env files do not already exist, copy `apps/web/.env.example` to `apps/web/.env.local`, and the equivalent for GreatHub. **Preserve existing files.** Next.js reads each app's `.env.local`; the root `env.local` is not loaded automatically.

Use values from `supabase status`:

| Variable | Cartel | GreatHub |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Local API URL | Same local API URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Local publishable key | Not needed |
| `SUPABASE_SECRET_KEY` | Local secret key | Local secret key |
| `CARTEL_JWKS_URL` | `http://localhost:3000/.well-known/jwks.json` | Same URL |
| `CARTEL_BASE_URL` | Not needed | `http://localhost:3000` |

Restart the apps after changing env values. Only `NEXT_PUBLIC_` variables are browser-visible; never use that prefix for secret keys. Full future-phase settings remain in the root [.env.example](.env.example).

External services used later:

| Service | Env keys | Notes |
|---|---|---|
| OpenAI (primary AI) | `OPENAI_API_KEY`, `OPENAI_MODEL_PRIMARY`, `OPENAI_MODEL_FAST` | `gpt-6-sol` + `gpt-6-luna` for demos; set both to `gpt-6-luna` while testing |
| Meta Model API (fallback AI) | `META_MODEL_API_KEY`, `META_BASE_URL`, `META_MODEL_*` | Muse Spark, OpenAI-compatible at `https://api.meta.ai/v1` |
| Visa Acceptance sandbox | `VISA_ACCEPTANCE_*` | Needed in both apps; GreatHub calls the Payments API |
| Authorize.net sandbox | `AUTHORIZE_NET_*` | Fallback rail |
| Icecat | `ICECAT_USERNAME`, `ICECAT_API_TOKEN` | Manufacturer specs; Open Icecat covers sponsor brands only |
| UPCitemdb | `UPCITEMDB_USER_KEY` (optional) | Replaces Best Buy (no access). Keyless trial: 100 requests/day per IP |

Budget and model choices are in [SDD §10.4](docs/SDD.md#104-providers-models-and-budget).

Anonymous sign-in and manual identity linking are enabled locally. An anonymous identity is created on the first client visit and stored in Supabase SSR cookies; `proxy.ts` verifies/refreshes identity on subsequent requests. Authorization belongs to each route and the database policies, not the proxy alone. Email auth is enabled by the CLI defaults; local messages land in Mailpit. Google OAuth remains disabled until real client credentials are available. Add them via `env(SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID)` and `env(SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET)` in the Google config block and enable it. Cloud Auth settings must be configured separately; local config does not automatically update a cloud project.

## Verify the foundation

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm db:lint
pnpm db:test
pnpm test:realtime
```

The Realtime smoke test only accepts a local Supabase address. It creates two temporary anonymous users, verifies that only the owner can join `plan:{id}`, inserts five events, checks delivery below 500 ms, and deletes its test users afterward. SQL tests cover cross-user read/write isolation and server-only health access.

For browser verification, open `/foundation`, wait for `Session: ready`, create a test plan, and insert an event. The panel displays measured insertion-to-receipt latency. Reload to confirm the same identity persists. Remove the test plan when finished. A channel failure switches to explicitly labeled one-second polling.

`pnpm db:reset` rebuilds **local** data from migrations and seed SQL. Use it only when disposable local data can be reset.

## Health and signing identity

Both `/api/health` routes check configuration, a real Postgres RPC, and reachable public signing keys. Responses contain only status labels and a request ID. HTTP 503 with an unconfigured signing identity is expected before key setup.

The web app publishes `/.well-known/jwks.json` from `AGENT_SIGNING_JWK` and `AGENT_KEY_ID`. Supply a valid Ed25519 private JWK and a matching key ID through private environment variables. The endpoint derives the public key and returns only `kty`, `crv`, `x`, `kid`, `use`, and `alg`. It never serializes the private input directly. Contract signing and TAP request signing are later-phase work.

## Observability

Both apps initialize Sentry when their DSNs are configured. Configure `SENTRY_DSN` for server errors and `NEXT_PUBLIC_SENTRY_DSN` for browser errors. User information, cookies, bodies, query parameters, AI inputs/outputs, and database payload collection are disabled. Pino redacts credential, session, body, and payment fields. Request IDs propagate through proxies, health checks, outbound JWKS checks, and Sentry request-error tags.

In development, POST `/api/internal/diagnostics` with an `Origin` matching the local app to send a tagged test exception. It returns a Sentry event ID, request ID, and flush result. Check that event in Sentry to validate delivery. This endpoint is unavailable in production builds. Production source-map upload additionally needs `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT` for each app.

## Deploy later

Create Vercel projects rooted at `apps/web` and `apps/greathub`, using Next.js and Node 24. Keep workspace files outside the root directory available to the build. Install from the repository root with `pnpm install --frozen-lockfile`; build each app with its `pnpm build` script. Assign each project's environment variables separately. Both apps use the same Supabase project for each environment: dev for previews, prod for the stable demo.

The repository includes GitHub Actions jobs named `quality` and `database`. Set them as required PR checks in repository settings. Domain assignment, HTTPS verification, cloud linking, cloud migrations, Google credentials, and Sentry delivery require the corresponding accounts/configuration and are not completed by this scaffold.

There is one cloud project, `HackGt13`, and this checkout is already linked to it (`supabase/.temp/project-ref`). To relink, use `pnpm exec supabase login` and `pnpm exec supabase link --project-ref <ref>`. Review the target before applying any cloud migrations. Only `public` is exposed through the Data API; `internal` and the future `greathub` schema must stay unexposed. A Supabase secret key bypasses RLS project-wide, so separate secret keys alone do not provide schema isolation for GreatHub; its later database access design must enforce that boundary.

## Repository layout

- `apps/web`: Cartel, paper/blueprint UI, session provider, private Realtime panel.
- `apps/greathub`: fictional merchant shell on port 3001.
- `packages/platform`: environment checks, safe JWKS export, health, logging, request IDs.
- Other `packages/*`: typed module boundaries reserved for subsequent phases; domain implementations are intentionally absent.
- `supabase`: local configuration, infrastructure migration, SQL permission tests.
- `docs`: source design and implementation checklist.

Current integration references: [Supabase SSR](https://supabase.com/docs/guides/auth/server-side), [Realtime authorization](https://supabase.com/docs/guides/realtime/authorization), [Next.js proxy](https://nextjs.org/docs/app/api-reference/file-conventions/proxy). The installed Next.js package also ships version-matched guides under `node_modules/next/dist/docs` in each app.
