# Demo run sheet (Phase 18)

What to run, click and say on demo day. The design is [SDD §25](SDD.md#25-demo-plan); every number comes from the canonical dataset in [SDD §16.1](SDD.md#161-canonical-demo-dataset). Tasks: [TASKS.md Phase 18](TASKS.md#phase-18-demo-and-submission-m-lead-everyone).

## 1. Setup and reset (T18.1)

Create `.env.demo` at the repo root (gitignored by `.env*`) pointing at **production**:

```sh
CARTEL_URL=https://cartel.<domain>
GREATHUB_URL=https://greathub.<domain>
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_SECRET_KEY=sb_secret_...
CHAOS_ADMIN_TOKEN=...                 # GreatHub's value
DEMO_USER_EMAIL=demo@<domain>         # or DEMO_USER_ID=<auth.users id>
PAYMENT_RAIL=visa_acceptance          # what production uses
OPENAI_API_KEY=...                    # for the prompt-cache warm-up
```

Then:

```sh
pnpm demo:reset --dry-run   # shows what would change, changes nothing
pnpm demo:reset
```

| Step | What it does | Fails when |
|---|---|---|
| GreatHub reset | `POST /api/chaos/reset`: restores the seeded prices, specs, sellers and policies, and clears recalls | GreatHub is down or the token is wrong |
| Demo user plans | Deletes the demo user's `plans` rows (their contracts, runs and orders cascade). Ledger events stay, because the ledger is append-only. | The user can't be found, or the passkey or card count changes. Warns when either count is 0. |
| AI prompt cache | `pnpm ai:warm`: two A1 calls on the flagship brief with every pack, so the second reports cached input tokens | No API key, or the model doesn't answer |
| Bench pre-run | Runs `pnpm --filter @cartel/bench bench` once Phase 16 adds that script. Until then it is skipped. | The bench fails |
| Search cache | Streams `/api/search?q=navy linen shirt` so each source's results sit in `search_queries` | No source returns products |

**The search cache lasts 10 minutes** (Shopify results are never cached). Run the reset last thing before going on stage, and between rehearsals.

Verified locally against `supabase start` and both apps in dev mode: after a Chaos Panel "Flagship: deal trap", the reset put U2727 back from $319 to $329. It deleted the demo user's two plans and left another user's plan, the passkey, the card and all ledger events alone. The search step cached GreatHub's 9 results.

## 2. Environment check, 30 minutes before judging (T18.2)

```sh
pnpm demo:check --visa
```

It checks both `/api/health` endpoints (GreatHub's `jwks ok` means it can reach Cartel's JWKS), Cartel's JWKS, every page the script opens, the local `PAYMENT_RAIL` value, a $1.00 Visa Acceptance sandbox authorization (`--visa`), the latest `bench_runs` row, the ledger chain of every demo-user plan, the demo user's passkey and card, and the "navy linen shirt" search. It exits 1 on any failure.

Check by hand:

- [ ] `pnpm demo:check --visa` is all ✓; `PAYMENT_RAIL` in Vercel matches.
- [ ] Touch ID signs on the demo laptop on the **production** domain (`/settings/signing` → the key is listed). The phone backup is signed in to the same account.
- [ ] Chaos Panel (`greathub.<domain>/chaos`) is signed in and open in its own window; **Reset** has run; the Agent Log (`/agents`) is visible.
- [ ] Latest bench is green; **Verify chain ✓** on `/ledger/flagship`.
- [ ] `/search?q=navy linen shirt` shows results from each enabled source, or the warm cache.
- [ ] Reduced motion is **off** (System Settings → Accessibility → Display); volume muted; Focus / Do Not Disturb on.
- [ ] Phone hotspot is on and the laptop has joined it once.
- [ ] Browser zoom at 110–125% so the back row can read it; bookmarks bar hidden; one tab per beat, opened in order.

## 3. What the current build shows live

The team must say only what is true. As of this commit:

| Beat | Live on production | Replayed from fixtures (engine output, not a recording) |
|---|---|---|
| Brief → requirements | Any other brief is saved as a real plan | The flagship brief opens the demo plan's requirements. **A1 streaming isn't wired into the web app yet** (PHASE9 "Not done here"), so requirements don't stream in and there is no AI-off toggle. |
| Plans A–C | `solvePlans` runs on every load of `/plans/flagship/compare` | Proof rows don't stream yet (T11.3) |
| Sign v7 / v8 with Touch ID | Passkey signing works on stored contracts (Phase 12) | Contracts can't yet be drafted from a saved plan (T11.6), so the flagship v7 and v8 are fixtures and **can't be signed live**. Say "signed earlier" rather than performing Touch ID on them. |
| Chaos Panel mutations, Agent Log | Real: they write GreatHub's database and `mutation_log` | — |
| Webcam −$4, deal trap block, layers table | The consent diff runs on each page load | Driven by the fixture checkout states, not by reading GreatHub after the mutation |
| Execute → Visa → receipt $870.37 | The ACP + guard + Visa path is verified by `pnpm test:acp-contract --visa` | The flagship receipt and order `CT-0926-0001` are fixtures |
| Explore "navy linen shirt" | Live `/api/search` over the enabled sources | The demo catalog is used when the catalog DB isn't connected |
| `/bench` | Five live attacks run through the real engine on click | "62/62" needs the Phase 16 suite; until a `bench_runs` row exists, don't say 62 |
| Ledger Verify chain | Recomputed in the browser | The flagship ledger is 13 fixture events |

If Phase 16 (bench suite) or the T11.6 draft-from-plan work lands before judging, update this table.

## 4. The 3:00 script (T18.3)

Roles: **Speaker** ______ (talks, never touches the laptop) · **Driver** ______ (clicks, never talks). Tabs open in this order: `/`, `/new`, `/plans/flagship/requirements`, `/plans/flagship/compare`, `/plans/flagship/contract?v=7`, GreatHub `/chaos`, `/plans/flagship/diff/deal-trap`, `/plans/flagship/contract?review=1`, `/plans/flagship/checkout`, `/orders/CT-0926-0001`, `/search?q=navy linen shirt`, `/bench`, `/ledger/flagship`.

| At | Driver | Speaker (say it this way) |
|---|---|---|
| 0:00 | `/`: scroll once; the Scout pulls the next sheet down | "AI can already find products and click Buy. The dangerous part is everything that changes in between." |
| 0:15 | `/new`: paste the home-office brief → requirements. Point at **You said** / **I assumed**; confirm "USB-C power ≥ 65 W". | "Every rule says where it came from. This one I assumed from 'charges my MacBook over one cable', so it waits for you to confirm." |
| 0:35 | Compare: Plans A–C. Open the monitor's USB-C row, then comfort. | "Manufacturer says up to 90 watts, quoted from the source. Comfort? Can't check. It's subjective, and we say so." |
| 0:55 | Contract v7: exact SKUs, max $910, Balanced, mandate "≤ $320". Point at the SIGNED stamp and hash. | "You sign this exact document with your passkey. The hash is what the payment carries." |
| 1:10 | Chaos Panel: webcam price drop −$4. Back to Cartel: ledger line "auto-accepted under Balanced". | "Four dollars cheaper, same webcam. Balanced says that's fine. Cartel doesn't nag." |
| 1:20 | Chaos Panel: **Flagship: deal trap**. Open the deal-trap diff: red pen on 15 W, layers table. | "Same SKU, ten dollars cheaper, which fires your mandate. But it now charges at 15 watts. Cart hash ✓, merchant ✓, amount ✓, Cartel ✗." Pause. "**The payment was valid. The purchase wasn't.**" |
| 1:50 | Contract `?review=1`: Halden M27Q-USBC, v7 → v8 diff. | "Here's the compliant alternative: 65 watts, $309. You approve the change, not a new shopping trip." |
| 2:05 | Checkout → order `CT-0926-0001`; GreatHub Agent Log. | "GreatHub verified our agent's signature and your signed contract. Visa sandbox authorized it. $870.37." |
| 2:25 | *(skippable)* `/search?q=navy linen shirt` → a product → **Add as rule** on "≥ 90% linen" → tier badge. | "Browsing works across real sources. Every spec says who said it, and we're honest about where we can pay." |
| 2:40 | `/bench` → **Run live**; `/ledger/flagship` → **Verify chain**. | "Every attack in the bench, caught; nothing benign blocked. And the whole history verifies." |
| 2:52 | Stay on the ledger. | "**Cartel doesn't ask you to trust the AI. It gives the AI rules it can't spend around.**" |

**If you're over time**, cut in this order: the breadth flash (2:25, saves 15 s), then the webcam beat (1:10, saves 10 s). Never cut the deal trap or the close.

**If something breaks on stage**: a page error → the Driver opens the backup video at that beat and the Speaker keeps talking. A GreatHub outage → skip to the diff page, which doesn't need GreatHub. Wi-Fi → phone hotspot.

### Rehearsal log

| # | Date / time | Speaker | Driver | Total | Over at | Fix before the next run |
|---|---|---|---|---|---|---|
| 1 | | | | | | |
| 2 | | | | | | |
| 3 | | | | | | |

Run `pnpm demo:reset` before each run.

## 5. Backup video (T18.4)

- One take of the §4 script, the Driver's screen only, 1920×1080 at 30 fps (macOS: ⇧⌘5 → Record Entire Screen; or OBS). Run `pnpm demo:reset` first.
- Audio: the Speaker's lines, recorded with the video. No music.
- Captions: burn in or upload an `.srt` made from the Speaker column. YouTube's auto-captions are acceptable if checked for "Cartel", "GreatHub" and the dollar amounts.
- Upload to YouTube as **Unlisted**, title "Cartel · HackGT 13 demo (3:00)". Put the link in Devpost and in `docs/DEVPOST.md`.
- Keep a local copy on the demo laptop's desktop, for when Wi-Fi fails.

## 6. Judge Q&A drill (T18.7)

Each person answers two out loud, in under 30 seconds each, then swaps. Answers are in [SDD §25.3](SDD.md#253-judge-qa-cheat-sheet). Corrections for the current build are below.

| Question | Who |
|---|---|
| "Isn't this an AI wrapper?" | |
| "What if the LLM hallucinates a spec?" | |
| "Is the Visa part real?" | |
| "How is this different from AP2 / ACP / UCP?" | |
| "Where do the products come from?" | |
| "Why the doodles?" | |
| "Can I verify it myself?" | |
| "Why would merchants adopt it?" | |
| "Multi-merchant?" | |
| "What if the merchant lies in JSON-LD?" | |

Corrections to the cheat sheet until the gaps in §3 close:

- **AI wrapper**: there is no AI-off toggle in the UI yet. Say instead: "The AI package is separate and has no side-effecting tools. The proof engine, signing, guard and payment don't import it. Every beat you just saw ran without a model call."
- **Visa**: say "sandbox" every time. VIC is a stub behind the `PaymentRail` interface and never falls back silently.
- **Verify it yourself**: true today. `/orders/CT-0926-0001/evidence-pack` downloads the pack; `node verify.mjs pack.zip` checks it offline.

## 7. Submit (T18.8)

- [ ] Devpost fields filled from [DEVPOST.md](DEVPOST.md), with the screenshots and the video link.
- [ ] The repo is public, or judges have been given access; the README is current.
- [ ] Submitted by H+35 (one hour of buffer). Screenshot the confirmation page.
