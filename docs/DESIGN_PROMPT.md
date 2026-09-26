# ProofCart — Claude Design prompts

How to use this file:

1. Paste **Part 1 (master brief)** into Claude Design first. It sets the product, the visual system, the cast and the sample data for every later screen.
2. Then paste the **Part 2 screen prompts** one at a time, in order. Each one assumes the master brief is already in the conversation.
3. Use **Part 3** for the character sheet and motion storyboards, and **Part 4** for review and iteration.
4. Save the final tokens and a screenshot of every screen into `docs/mockups/` (task T0.5).

All numbers and names below match the canonical demo dataset in `SDD.md` §16.1. Keep them identical so the mockups, the seed data and the demo script agree.

---

## Part 1: Master brief (paste this first)

```
You are designing ProofCart, a web app for a Visa-sponsored hackathon (HackGT 13). I need high-fidelity mockups for desktop (1440 px wide) and mobile (390 px wide). Please read this whole brief before designing anything; I will ask for individual screens afterwards.

WHAT PROOFCART IS
ProofCart is the policy, evidence and consent layer between an AI shopping decision and a payment. A shopper describes what they need ("a home office under $1,000, the desk must fit a 48-inch alcove…"). ProofCart turns that into explicit rules, finds products, proves each rule against evidence with a deterministic engine, and has the shopper sign an exact Purchase Contract with a passkey (Touch ID). Right before any money moves, ProofCart re-checks the live checkout. If anything material changed (for example, the merchant quietly edited a monitor's specs on the same SKU), the purchase is paused and no payment is made. It is also a browsable catalog: products come from several real sources, and every spec shows its "receipt" (who says so, and when).

Taglines:
- "Know exactly what you approved, and stop the purchase if that changes."
- "The payment was valid. The purchase wasn't."
- "ProofCart doesn't ask you to trust the AI. It gives the AI rules it can't spend around."

AUDIENCE AND TONE
Everyday shoppers making considered purchases, and hackathon judges from a payments company. The product must feel trustworthy and precise, with a warm, memorable, hand-made personality. Think "a beautifully kept notebook for serious decisions". Playful at the edges (landing page, empty states, loading, success moments). Formal and crisp wherever money moves (contract, checkout, receipt). It must never look childish.

VISUAL SYSTEM: PAPER AND DOODLES
Materials:
- The page is warm paper with a very faint grain and a subtle 24 px dot grid.
- Cards are clean sheets of paper with a soft stacked-paper shadow, crisp 1 px borders and an 8 px radius. Nothing is tilted, taped or sketchy.
- Everything is typeset and precisely aligned. It should feel like a well-designed financial document or a premium editorial site, not a scrapbook.
- Only three hand-made annotation marks exist, used sparingly: a red-pen circle around a failing value, yellow highlighter behind quoted evidence, and a bracket grouping related changes in a diff. Plus rubber stamps for committed events.

Color tokens (light theme = paper):
- paper #FBF7EE (page), paper-raised #FFFDF7 (cards)
- graphite #2B2A28 (body text, line work)
- pencil #8A8680 (tentative content; only for large text or next to an icon and a label)
- ink #1F3A93 (content stated by a source; links)
- red-pen #C8352E (fail)
- green-check #2F7D32 (pass)
- highlighter #FFE45C at about 40% opacity behind text (quotes, search matches)
Dark theme = blueprint: background #14233A, cards #1B2D48, lines and text #E9EEF5, pencil #9FB0C8, ink #8FB4FF, red-pen #FF8A80, green-check #8FD694.

The most important idea: certainty is visible in the drawing style.
- PENCIL (graphite-gray text, dashed 1 px outline, an "I assumed" or "Estimate" tag) = tentative: things the AI assumed, estimates, AI-written summaries.
- INK (solid text, solid 1 px outline) = a source states it: specs, prices, confirmed rules.
- RED-PEN circle plus ✗ = fails a rule.
- RUBBER STAMP = committed: "SIGNED v7", "PAID", "BLOCKED". Bold sans caps with slightly uneven ink, like a real stamp.
- DOCUMENT PAGE (serif, numbered clauses) = the contract itself and the receipt.
The drawing style always reinforces a text label and an icon. It never replaces them. Status must be readable in grayscale.

Typography:
- Headings: Source Serif 4, semibold, tight tracking.
- Body and UI text: Geist Sans.
- Contract and receipt body: Source Serif 4 with numbered clauses, like a well-set legal document.
- Money, quantities, SKUs and hashes: Geist Mono with tabular numerals.
- No handwriting fonts and no typewriter fonts anywhere.

Status vocabulary (use these exact labels, always with an icon):
- ✓ Pass / ✗ Fail / ? Can't check / ~ Estimate
- Evidence labels: "Confirmed · Merchant checkout · 12 s ago", "Manufacturer says", "Seller says", "Evidence suggests", "Estimate", "Can't check", "Sources disagree"
- Requirement provenance: "You said" (ink), "You chose" (ink), "I assumed" (pencil, with a Confirm button), "Default" (small gray tag)
- Checkout tiers: "Full ProofCart checkout", "Hand off to store", "Proof only"

THE CAST (stick figures; each one is a part of the system)
Simple, charming line-drawn stick figures in graphite with a single accent color each. Round head, no facial detail beyond two dots and a small line. Clean, even strokes (illustration quality, not scribbles). In the app they are 48–96 px tall; on the landing page they can be larger.
- SCOUT (the AI shopper): baseball cap, binoculars, small satchel. Accent ink blue. Finds and carries products. Important: the Scout NEVER holds a wallet or card; the AI can't pay.
- INSPECTOR (the proof engine): magnifying glass and clipboard. Accent green. Checks and stamps each rule ✓ ✗ ?.
- NOTARY (consent/signing): bow tie and a big rubber stamp. Accent red stamp ink. Stamps the contract only after Touch ID.
- GUARD (the payment guard): holds a stop sign and stands by a velvet rope barrier. Accent highlighter yellow on the sign. Steps in front of the Pay button when the purchase no longer matches.
- GREMLIN (appears only on the DemoMart test-merchant Chaos Panel): small, mischievous, carries price tags and a pencil. Swaps tags and edits specs so the others can catch it.
Rules: the figures are decorative helpers at the edges of the UI. They never sit inside the contract text, the card-entry form or on the Pay button itself.

SAMPLE DATA (use exactly)
Brief: "Build my home office for under $1,000. The desk has to fit a 48-inch alcove, I want a 27-inch 4K monitor that charges my MacBook over one USB-C cable, and everything has to arrive by Monday. Don't substitute anything without asking."

Rules:
- Delivered total ≤ $1,000 (Hard, You said)
- Desk width ≤ 48 in (Hard, You said)
- Monitor 27 in, 4K (Hard, You said)
- Arrives by Mon Sep 28 (Hard, You said)
- No substitutions (Hard, You said)
- Monitor USB-C power ≥ 65 W (Hard, I assumed from "charges my MacBook over one USB-C cable" → confirmed)
- Cable rated ≥ 65 W (Hard, Default)
- Chair has adjustable lumbar (Preference, I assumed)
- Chair comfort (Can't check: subjective; waived by the user)

Plan A (merchant: DemoMart, a clearly labeled test merchant):
- Desk: Birchline Compact Desk 46.5" · $229.00 · width 46.5 in (Manufacturer says)
- Chair: Kestrel Mesh Task Chair · $189.00 · adjustable lumbar (Manufacturer says) · comfort: Can't check
- Monitor: Vireo U2727 27" 4K USB-C · SKU U2727 · $329.00 · USB-C power up to 90 W (Manufacturer says)
- Cable: Loop USB-C Cable 100 W, 2 m · $19.00 · rated 100 W
- Webcam: Pica 1080p Webcam · $49.00
Merchandise $815.00 · Shipping $24.00 · Est. tax $57.05 · Delivered total $896.05
Contract v7: max total $910.00 · autonomy preset "Balanced" · standing mandate "Execute when the Vireo U2727 is ≤ $320, before Mon Sep 28" · hash sha256:7c1e…a94f
Proof summary: 12 of 12 hard rules pass · 1 can't check (waived)

Events:
1. Webcam $49 → $45: auto-accepted under Balanced. New total $891.77.
2. Deal trap on the same SKU U2727: price $329 → $319 AND USB-C power 90 W → 15 W. The price drop fires the mandate. ProofCart re-checks: 15 W < 65 W → FAIL → purchase paused. The total would have been $881.07. No payment was made.
3. Replacement: Halden M27Q-USBC 27" 4K · USB-C power 65 W · $309.00. Contract v8: merchandise $791.00 · shipping $24.00 · tax $55.37 · delivered total $870.37 · max $885.00 · hash sha256:b04d…19e2. Paid: Visa Acceptance sandbox · AUTHORIZED · transaction ID 7412 8830 1956 · order #PC-89211.

Explore sample: search "navy linen shirt". Sources: Shopify Catalog ✓ 42 results · UPCitemdb ✓ 0 · DemoMart ✓ 6. Products use fictional names (e.g., "Harbor Linen Shirt, Navy · $68 · 100% linen (Seller says) · Hand off to store").

DESIGN SYSTEM DELIVERABLES
Components I need to see, used consistently across screens: RequirementChip, EvidenceBadge, ProofRow, ProofSummary, PlanCard, ProductCard, SpecReceiptRow, FacetChip (with an "Add as rule" affordance), CheckoutTierBadge, SourcePill, LayersTable, ContractDiff (git-diff style, monospace), HashPill (abbreviated, copy icon), LedgerTimeline, GuardStepper, CommandBar, PlanTray (bottom sheet), CompareTray, Stamp, Mark (red-pen circle / highlighter / bracket).

HARD CONSTRAINTS
- WCAG 2.2 AA: body text contrast ≥ 4.5:1, visible focus rings on paper and on blueprint, targets ≥ 24 px.
- Never convey status with color alone: always icon + text.
- No handwriting fonts. All text is typeset.
- Contract, checkout and receipt screens are formal: document page, straight lines, stamps; no playful figures inside them.
- No real retailer logos or real product names. Sources can be named in small text ("Shopify Catalog", "UPCitemdb", "DemoMart (test merchant)").
- Avoid: generic fintech gradients, glassmorphism, neon, stock photos, emoji-as-icons, clutter, "AI sparkle" icons.

Before designing screens, reply with: (1) a one-page style tile (colors, type specimens, card and border samples, the pencil/ink/red-pen/stamp states, status icons), and (2) a short list of any questions. Then wait for my screen requests.
```


---

## Part 1b: Answers to Claude Design's follow-up questions

Paste this after Claude Design replies to the master brief with its questions.

```
Answers to your questions, plus one direction change.

DIRECTION CHANGE: drop the handwriting style completely. I want this to feel trustworthy, like a premium financial document, and the handwriting takes away from that. Specifically:
- No handwriting fonts anywhere (no Shantell Sans, no Caveat) and no typewriter font.
- Headings: Source Serif 4, semibold, tight tracking. UI and body: Geist Sans. Contract and receipt body: Source Serif 4 with numbered clauses. Money, SKUs and hashes: Geist Mono, tabular numerals.
- Crisp 1 px borders, 8 px card radius. No tilted cards, no tape, no sketchy borders.
- Keep the warm paper background (very subtle grain), the stamps, and exactly three annotation marks: red-pen circle on failing values, highlighter behind quoted evidence, bracket grouping diff changes.
- "Pencil" now means graphite-gray text with a dashed 1 px outline and an "I assumed" or "Estimate" tag, not wobbly lines.
- The stick-figure cast stays, drawn with clean, even strokes. They are the only illustrative element.

1. Cast art: please draw them yourself. Keep them simple and consistent: round head, two-segment limbs, 2 px strokes at 96 px tall, graphite plus one accent color each. We'll rebuild them as SVG in code, so construction clarity matters more than polish. Don't leave empty slots.
2. Handwriting font: neither. See the direction change above.
3. Blueprint (dark) theme: only three key screens: the workspace with the proof panel, the contract, and the purchase-paused screen. Everything else is light only.
4. Touch ID: show only ProofCart's side before and after (the "Sign with passkey" button, then the signed state). In between, use a neutral, clearly generic placeholder card labeled "System passkey prompt". Do not recreate Apple's system UI.
5. Priority, in this order:
   a. Workspace (plan + streaming proof panel + evidence drawer)
   b. Contract and signed state
   c. Purchase paused
   d. Revised contract diff (v7 → v8) and the paid receipt
   e. Search results (loading + loaded) and the product page with specs and receipts
   f. Landing page
   g. ProofBench, ledger, and the DemoMart Chaos Panel
   h. Edge states and the trust page
6. Mobile: only the approval and alert moments: sign (contract + signed state), purchase paused, and paid receipt, plus the workspace's sticky summary bar ("$896.05 · 12/12 pass · Ready to sign"). No other mobile screens for now.

Please update the style tile with the new typography and borders first, then start on screen (a).
```

---

## Part 2: Screen prompts (paste one at a time)

### 2.1 Landing page (desktop + mobile)

```
Design the landing page, desktop 1440 wide and mobile 390 wide.

Structure, top to bottom, as a stack of paper sheets:
1. Top nav: ProofCart wordmark (Source Serif 4, with a small stamp-style check mark), links Explore · How it works · Trust, and a "Start a plan" button.
2. Hero sheet: headline "Know exactly what you approved." Subhead: "ProofCart lets AI shop for you, proves every rule against real evidence, and stops the payment if anything changes." Primary button "Start a plan", secondary "Explore products". On the right, a small live-looking vignette: a mini contract card with "SIGNED v7" stamped on it, and the Guard standing beside a Pay button holding the stop sign.
3. Scroll moment: show the Scout hanging from a rope at the top edge of the next sheet, as if pulling it down into view. (This will be scroll-linked in code. Show it as a frozen mid-pull frame.)
4. "Meet the crew" sheet: the four figures in a row (Scout, Inspector, Notary, Guard), each with one line: "Scout finds. Never holds the wallet." / "Inspector checks every rule against evidence." / "Notary stamps only after your Touch ID." / "Guard stops the payment if anything changes."
5. "Pencil, ink, stamp" sheet: three small columns explaining the visual language with examples: pencil "I assumed: USB-C power ≥ 65 W · Confirm?", ink "Manufacturer says 90 W", stamp "SIGNED v7".
6. "The trap" sheet: a compact before/after showing the same SKU U2727 with price $329 → $319 and USB-C power 90 W → 15 W, a red-pen circle on 15 W, and the line "The payment was valid. The purchase wasn't."
7. Footer: small print "Demo merchant and sandbox payments. Built at HackGT 13."

Mobile: single column, the crew in a 2×2 grid, the rope moment above the second sheet.
```

### 2.2 Explore and search (loading + loaded)

```
Design /search?q=navy linen shirt in two states on desktop, plus the loaded state on mobile.

Shared layout: a clean search bar at the top; below it a "source strip" showing each source's status; a left facet panel; a results grid of ProductCards; a PlanTray collapsed at the bottom ("Your plan · 0 items").

State A, loading: the Scout mid-run between three source icons in the source strip. Status reads "Shopify Catalog ✓ 42 · UPCitemdb · searching… · DemoMart ✓ 6". Results that have arrived are shown; remaining slots are paper-textured skeleton cards (no spinners). An aria-live style text line under the strip: "Searching Shopify Catalog, UPCitemdb, DemoMart…".

State B, loaded: all sources settled ("Shopify Catalog ✓ 42 · UPCitemdb ✓ 0 · DemoMart ✓ 6"). The Scout rests at the end of the strip with a full satchel.

Facet panel: Price, Fiber (Linen ≥ 90%, Cotton, Blend), Size, Color, Returnable, Arrives by. Each facet value has a small "+ Add as rule" affordance. Show "Linen ≥ 90%" selected and a tooltip preview: "Add as rule: Fiber linen ≥ 90% (You chose)".

ProductCard: image, name, price, fiber claim with its evidence label ("100% linen · Seller says"), SourcePill ("Shopify Catalog"), CheckoutTierBadge ("Hand off to store"), and a compare checkbox. Use fictional products: Harbor Linen Shirt, Navy ($68); Tidewater Camp Shirt ($74); Selvedge & Co. Linen Overshirt ($92); Marlow Linen Popover ($58, DemoMart, "Full ProofCart checkout").

Mobile: two-column grid, facets in a bottom sheet opened by a "Filters" button, the source strip scrolls horizontally.
```

### 2.3 Product page (specs with receipts)

```
Design the product page for "Halden M27Q-USBC 27" 4K USB-C Monitor" on desktop and mobile.

Left: image gallery on a clean paper card.
Right top: name, "Offers" table with one row per source: DemoMart (test merchant) $309.00 · in stock · arrives Sat Sep 26 · "Full ProofCart checkout"; Newegg (via UPCitemdb) $329.99 · last seen Sep 20 · "Proof only". Buttons: "Add to plan" (primary) and "Compare".

"Specs with receipts" section: a table of SpecReceiptRows. Each row = spec name · value (Geist Mono) · evidence label · source · age. Rows:
- Screen size · 27 in · Manufacturer says · Icecat · 3 min ago
- Resolution · 3840 × 2160 (4K) · Manufacturer says · Icecat
- USB-C power delivery · 65 W · Manufacturer says · Icecat
- Width · 24.1 in · Seller says · DemoMart
- Refresh rate · 60 Hz · Sources disagree: DemoMart says 60 Hz, UPCitemdb listing says 75 Hz (show both values and a small red-pen bracket)
- Price · $309.00 · Confirmed · Merchant checkout · 12 s ago
Each row has a subtle "Make this a rule" affordance on hover.

"Checks against your plan" card (the home-office plan is active): ✓ Monitor 27 in, 4K · ✓ USB-C power ≥ 65 W · ✓ Fits delivered total ≤ $1,000 · ~ Arrives by Mon Sep 28 (Estimate). The Inspector stands at the card's edge with the magnifying glass.

Mobile: gallery, offers, a sticky "Add to plan" bar, specs as stacked rows.
```

### 2.4 New plan + requirements review

```
Design two screens.

(1) /new: a large brief textarea on a lined-paper sheet with the sample brief typed in, template chips below ("Home office", "Wedding guest", "Carry-on kit", "Linen shirt"), and a "Build my plan" button. The Scout sits at the edge of the sheet with a notepad.

(2) /plans/[id]/requirements, titled "Here's what I understood. These are the rules I won't break without asking you."
Three groups:
- YOU SAID (ink): the five rules the user stated, each as a RequirementChip with a hard/preference toggle and an edit affordance. Hovering one shows the quoted phrase from the brief highlighted in yellow.
- I ASSUMED, CONFIRM? (pencil): "Monitor USB-C power ≥ 65 W. From: 'charges my MacBook over one USB-C cable'" with Confirm / Edit / Remove; and "Chair has adjustable lumbar (preference)".
- NEEDS YOUR ANSWER: a question card: "Is the 48-inch limit for the desk's width only, or width including a monitor arm?" with two answer buttons.
Also show a small "Default" rule: "Cable rated ≥ 65 W · Default (home-office pack)".
A secondary link: "Edit rules by hand (AI off)".
Primary button: "Find plans".
```

### 2.5 Workspace (three panes) with streaming proof

```
Design /plans/[id], the main workspace, on desktop, in the moment the proof is streaming in.

Layout: three persistent panes.
- Left, REQUIREMENTS (compact list of RequirementChips with provenance markers).
- Center, YOUR PLAN: plan switcher tabs "Plan A · Balanced" (selected), "Plan B · Cheapest", "Plan C · Better chair"; the five items from Plan A as rows (role, product, price, SourcePill); totals block: Merchandise $815.00 · Shipping $24.00 · Est. tax $57.05 (pencil, "Estimate") · Delivered total $896.05 (bold, Geist Mono).
- Right, PROOF: a ProofSummary header "11 of 12 checked…" and ProofRows appearing one by one. The Inspector is walking down the list, mid-stamp on the "USB-C power ≥ 65 W" row. Rows: ✓ Delivered total ≤ $1,000 · ✓ Desk width ≤ 48 in (46.5 in, Manufacturer says) · ✓ Monitor 27 in, 4K · ✓ USB-C power ≥ 65 W (up to 90 W, Manufacturer says) · ✓ Cable ≥ 65 W (100 W) · ~ Arrives by Mon Sep 28 (Estimate) · ? Chair comfort (Can't check: subjective).
- Bottom: CommandBar "Ask ProofCart… e.g. 'Make it $100 cheaper without changing the monitor'".

Also show the evidence drawer open over the right pane for the USB-C row: source snapshot text with the quote "USB-C upstream port with power delivery up to 90 W" highlighted in yellow, provenance (Manufacturer · Icecat · retrieved 2 min ago · extractor: JSON-LD), and a small "Untrusted text" note explaining that listing prose is treated as data.
```

### 2.6 Contract and signing

```
Design /plans/[id]/contract. This screen must feel formal and trustworthy.

The contract is a document page (Source Serif 4, numbered clauses) on crisp paper, titled "PURCHASE CONTRACT v7".
Sections: Intent (the brief, quoted) · Approved items (exact SKUs, merchant "DemoMart (test merchant)", seller, qty, unit price in Geist Mono) · Hard rules (12, each with ✓) · Waivers ("Chair comfort: Can't check. I accept this.") · Economics (merchandise, shipping, est. tax, delivered total $896.05, MAXIMUM TOTAL $910.00) · Autonomy: a three-option selector Strict / Balanced (selected) / Flexible with a small table of what each allows ("Price drops: auto", "Seller change: always asks", "Rule fails: always blocks") · Standing mandate: "Execute when the Vireo U2727 is ≤ $320, before Mon Sep 28" · Expires · HashPill "sha256:7c1e…a94f".

Bottom: a single primary button "Sign with passkey" with a fingerprint icon, and small text "Touch ID signs this exact version. Any change creates v8."

Show a second state: after signing. The Notary figure stands in the margin, having just stamped "SIGNED v7 · Sep 26, 10:42" in red ink across the top right of the page. The button area now reads "Armed: waiting for the monitor to reach $320."
```

### 2.7 Purchase paused (the hero moment)

```
Design /plans/[id]/diff/[id]: the purchase has been blocked. This is the most important screen in the demo; make it unforgettable but calm.

Header: a large stamp "PURCHASE PAUSED" and, directly under it in plain bold text, "No payment was made."
The Guard figure stands in front of a greyed-out Pay button, holding the stop sign, with a small rope barrier.

Layers table (the key visual), four rows, each with a check or cross:
- Cart hash (SKU, qty, price) · ✓ unchanged SKU U2727
- Merchant · ✓ DemoMart
- Amount within max · ✓ $881.07 ≤ $910.00
- ProofCart re-check · ✗ USB-C power 15 W < 65 W required
Caption: "Every payment check passed. The purchase still didn't match what you approved."

Approved vs current table for the monitor: Model Vireo U2727 → Vireo U2727 (same SKU) · Price $329.00 → $319.00 · USB-C power 90 W → 15 W (red-pen circle around 15 W) · Your rule ≥ 65 W · Result ✓ Pass → ✗ Fail.
An "AI summary" in pencil: "The monitor got $10 cheaper, but the listing now says it only delivers 15 W over USB-C, so it can't charge your MacBook with one cable."

Below: "Compliant alternative" card: Halden M27Q-USBC · 65 W · $309.00 · all 12 hard rules pass · button "Review revised contract".
```

### 2.8 Revised contract (v7 → v8 diff) and paid receipt

```
Design two screens.

(1) The revised contract diff. A ContractDiff in git-diff style (Geist Mono), with a curly-bracket annotation grouping the changes:
- Monitor  Vireo U2727   $329.00  USB-C 90 W → listing changed to 15 W
+ Monitor  Halden M27Q-USBC  $309.00  USB-C 65 W
- Delivered total  $891.77
+ Delivered total  $870.37
Hard rules: 12 / 12 pass. Max total $885.00. Button "Sign v8 with passkey".

(2) The paid state and order record. A receipt strip "printing" down from the top of the page (document style, perforated edge) with: PAID $870.37 · Visa Acceptance sandbox · AUTHORIZED · Transaction 7412 8830 1956 · Order #PC-89211 · Purchase Contract v8 · sha256:b04d…19e2 · 12/12 hard rules passed · Signed Sep 26, 10:44. Two small figures high-five beside it. Below: an order timeline (Paid → Confirmed → Shipped, the last two pending), buttons "Download Evidence Pack" and "Scan delivery", and a small line "Verified agent ProofCart (RFC 9421) · Customer-signed contract verified by the merchant".
```

### 2.9 Ledger, ProofBench and trust page

```
Design three supporting screens, desktop only.

(1) /ledger/[planId]: a vertical LedgerTimeline like entries in an audit log. Each entry has an actor icon (you, system, AI, merchant), a type, a time and a short hash. Entries: plan.created · requirements.extracted · requirement.confirmed · basket.solved · contract.signed v7 · change.auto_accepted (webcam −$4, with the Inspector's small thumbs-up) · mandate.fired · diff.detected → execution.blocked (red pen) · contract.signed v8 · payment.authorized · order.created. A "Verify chain" button with the result "✓ Chain intact · 11 entries".

(2) /bench: "ProofBench". A big counter "62 / 62 caught · 0 false blocks". Category rows with small bar charts (Identity 8/8, Same-SKU facts 8/8, Economics 8/8, Terms 6/6, Delivery 4/4, Availability 3/3, Recurring 3/3, Evidence 8/8, Derived 4/4, Security 5/5, Benign 5/5 allowed). A strip illustration of the Gremlin trying tricks (swapping a price tag, editing a spec) and the Guard blocking each. Button "Run live".

(3) /trust: "How ProofCart works". The four trust domains as the cast, left to right, with arrows: Scout (AI: proposes) → Inspector (engine: proves) → Notary (you: sign) → Guard (checks again, then pays). Under each: "Can" / "Can't" lists (e.g., Scout can: find products, suggest rules. Can't: pay, change signed contracts). Then the pencil/ink/stamp legend, the three checkout tiers, and "Honesty notes": DemoMart is a test merchant; payments run in the Visa Acceptance sandbox.
```

### 2.10 DemoMart Chaos Panel (separate brand)

```
Design the DemoMart test-merchant admin page /chaos. DemoMart is a separate brand from ProofCart: clean, simple, slightly retro store styling (cream and forest green), with a banner "DemoMart is a test merchant for demos" at the top. Keep the hand-drawn Gremlin as the only doodle.

Layout: left, a list of mutation buttons grouped (Price: price drop, price raise, shipping fee added · Specs: spec edit same SKU, variant swap, JSON-LD conflict · Terms: final-sale flip, return fee added · Delivery: slip, out of stock · Security: injection text). Center: "Scenario scripts" cards: "Flagship deal trap: Vireo U2727 $329 → $319 and USB-C 90 W → 15 W", "Webcam −$4", "Final-sale trap", with Run buttons; the Gremlin is mid-swap on the flagship card. Right: a live Mutation log and an "Agent Log" table (time · agent · key ID pc-agent-2026-09 · tag agent-payer-auth · ✓ Verified / ✗ Rejected · reason). Buttons: "Run mandate tick now" and "Reset".
```

### 2.11 Empty, error and edge states

```
Design a sheet of small state mockups (each about 480 × 320) using the cast:
1. Empty plan: the Scout sitting on an empty basket. "No items yet. Search, or start from a kit."
2. 404: the Scout holding a map upside down. "This page wandered off."
3. Error: a figure tangled in a USB cable. "UPCitemdb didn't answer. Other sources are fine." with a Retry button.
4. No plan fits: the Inspector with a clipboard. "No plan meets all 5 hard rules. The conflict is budget ≤ $1,000 + Monday delivery. Relax one: +$84, or arrive Wednesday." with two buttons.
5. Sources disagree: a small two-column comparison with a red-pen bracket.
6. Passkey cancelled: "Signing cancelled. Nothing was signed." with "Try again" and "Use my phone".
7. Hand-off notice: "Re-checked at 10:42. After this, the store's checkout decides." with a "Continue to store" button (tier badge: Hand off to store).
8. AI off / degraded: "AI is unavailable. You can still add rules by hand. Proof, signing and payment work the same."
```

### 2.12 Mobile workspace and paused state

```
Design the mobile (390 wide) versions of the workspace and the purchase-paused screen.

Workspace: segmented tabs "Plan · Rules · Proof" at the top, the Plan tab active, and a sticky bottom summary bar "$896.05 · 12/12 pass · Ready to sign" with a "Review contract" button. Show a pull-to-refresh moment at the top: a small figure yanking a rope, with the text "Refreshing prices…".

Paused: the stamp and "No payment was made." at the top, the layers table as four stacked rows, the approved vs current comparison as a compact card with the red-pen circle on 15 W, and the compliant alternative card with a full-width "Review revised contract" button. The Guard sits beside the header at 56 px.
```

---

## Part 3: Character sheet and motion storyboards

### 3.1 Character sheet

```
Create a character sheet for the ProofCart cast on a paper background.
For each figure (Scout, Inspector, Notary, Guard, Gremlin): a front view and a 3/4 view at 96 px and at 48 px, their props, and their accent color. Show the construction: a circle head, a torso line, two-segment arms and legs, so developers can rebuild them as SVG with joint angles.
Then show these poses for the relevant figures, each labeled: idle, run (4 frames), stamp (3 frames: raise, slam, lift), block (stop sign up), pull (3 frames on a rope), sit (on a basket), high-five (two figures), tangled (in a cable), map (upside down), thumbs-up.
Keep the line weight consistent (about 2 px at 96 px tall), clean even strokes, graphite color, one accent per figure.
```

### 3.2 Motion storyboards

```
Create storyboards (4–6 frames each, left to right, with timing notes under each frame) for these animations. Note the reduced-motion version for each one.
1. Landing scroll: the Scout hanging from a rope pulls the next paper sheet down as the user scrolls (tied to scroll position, never hijacking it). Reduced motion: sheets simply appear stacked.
2. Search loading: the Scout runs from source icon to source icon; each source gets a ✓ and a count as it returns. Reduced motion: a still Scout and the list of sources updating.
3. Proof streaming: the Inspector walks down the Proof list stamping each row as it arrives (about 150 ms per row). Reduced motion: rows appear with their stamps.
4. Signing: Touch ID confirmed → the Notary raises the stamp → slams "SIGNED v7" (the sheet jolts for one frame) → lifts away. Total ≤ 600 ms. Reduced motion: the stamp appears.
5. Purchase paused: the Guard steps in front of the Pay button and raises the stop sign; the red pen draws a circle around "15 W". Total ≤ 600 ms. Reduced motion: the Guard and circle appear.
6. Paid: the receipt strip prints down from the top; two figures high-five. Reduced motion: the receipt appears.
```

---

## Part 4: Review and iteration prompts

```
Review every screen against the brief and list problems in a table (screen · issue · fix). Check specifically:
- Is every status readable without color (icon + text)?
- Is there any handwriting font anywhere? (There must not be.)
- Do the contract, paused and receipt screens feel formal and trustworthy rather than cute?
- Are the figures ever inside the contract text, the card form or the Pay button? (They must not be.)
- Are the canonical numbers exactly right ($896.05, $891.77, $881.07, $870.37, max $910.00 and $885.00)?
- Contrast of pencil-gray text on paper and on blueprint.
Then apply the fixes.
```

```
Produce the dark "blueprint" theme for the workspace, contract and paused screens. Paper becomes deep blueprint blue with faint grid lines; pencil, ink, red-pen and highlighter become their light variants from the brief. Keep the stamps legible and the contrast at AA.
```

```
Export a design-token summary I can paste into Tailwind CSS v4: colors (light and dark), font families and the type scale, spacing scale, radii, the stacked-paper shadow, the focus-ring style, and the annotation-mark styles (circle, highlight, bracket).
```

```
Make the contract screen 20% more formal: remove decorative elements from the page body, strengthen the legal-document feel, and make the "Sign with passkey" button the single clear primary action.
```
