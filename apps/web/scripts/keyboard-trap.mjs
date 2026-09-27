// Keyboard-only walk of the trap path's screens (TASKS T16.6), on the flagship demo plan:
// checkout run list → "See why it paused" → Purchase Paused → "Review revised contract" →
// contract review, reaching "Sign with passkey". Only Tab, Shift+Tab and Enter are used, and
// every focus stop must show a visible focus indicator.
//
// This covers the screens, not the payment: the demo plan is fixture data and can't be signed,
// and drafting a signable contract from a plan is still open (docs/PHASE11.md "Still open").
//
//   pnpm --filter @cartel/web build && pnpm --filter @cartel/web start
//   E2E_BASE_URL=http://localhost:3000 pnpm --filter @cartel/web test:keyboard
// Set PLAYWRIGHT_CHROMIUM to a Chromium binary if Playwright's own isn't installed.
import { chromium } from "playwright";

const base = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const MAX_TABS = 80;

const browser = await chromium.launch(
  process.env.PLAYWRIGHT_CHROMIUM
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM }
    : {},
);
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.emulateMedia({ reducedMotion: "reduce" });
let failures = 0;

function fail(message) {
  failures += 1;
  console.log(`✗ ${message}`);
}

/** The focused element's accessible-ish name and whether its focus ring is visible. */
function focused() {
  return page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return null;
    const style = getComputedStyle(el);
    const ring =
      (style.outlineStyle !== "none" &&
        Number.parseFloat(style.outlineWidth) > 0) ||
      (style.boxShadow && style.boxShadow !== "none");
    return {
      name: (el.getAttribute("aria-label") ?? el.textContent ?? "")
        .replace(/\s+/g, " ")
        .trim(),
      tag: el.tagName.toLowerCase(),
      visible: Boolean(ring),
    };
  });
}

/** Tabs forward until the focused element's name contains `text`; checks each focus ring. */
async function tabTo(text) {
  for (let i = 0; i < MAX_TABS; i++) {
    await page.keyboard.press("Tab");
    const f = await focused();
    if (!f) continue;
    if (!f.visible)
      fail(`no visible focus indicator on <${f.tag}> "${f.name.slice(0, 60)}"`);
    if (f.name.includes(text)) return true;
  }
  fail(`"${text}" is not reachable with Tab on ${page.url()}`);
  return false;
}

async function expectPath(re, label, ready) {
  await page.waitForURL(re, { timeout: 15_000 }).catch(() => {});
  // Links navigate client-side: wait for the new screen before pressing more keys.
  await ready.waitFor({ timeout: 15_000 }).catch(() => {});
  if (re.test(new URL(page.url()).pathname + new URL(page.url()).search))
    console.log(`✓ ${label}`);
  else fail(`${label}: at ${page.url()}`);
}

await page.goto(`${base}/plans/flagship/checkout`, { waitUntil: "load" });
if (await tabTo("See why it paused")) {
  await page.keyboard.press("Enter");
  await expectPath(
    /\/plans\/flagship\/diff\/deal-trap$/,
    "Enter opens the paused screen",
    page.getByRole("heading", { name: /PURCHASE PAUSED/ }),
  );
}

const heading = await page.getByRole("heading", { level: 1 }).textContent();
if (heading?.includes("PURCHASE PAUSED")) console.log("✓ paused heading");
else fail(`paused screen heading: ${heading}`);
const status = await page
  .locator('[role="status"], [aria-live]')
  .allTextContents();
if (status.some((t) => t.trim().length > 0))
  console.log("✓ pause is announced to screen readers");
else fail("no live-region announcement on the paused screen");
const pay = page.getByRole("button", { name: /^Pay / });
if (await pay.isDisabled()) console.log("✓ Pay is disabled while paused");
else fail("Pay is enabled on the paused screen");

if (await tabTo("Review revised contract")) {
  await page.keyboard.press("Enter");
  await expectPath(
    /\/plans\/flagship\/contract\?review=1$/,
    "Enter opens the revised contract",
    page.getByRole("button", { name: /Sign v\d+ with passkey/ }),
  );
}
// Every control on the review screen is reachable, with a visible focus ring. On the demo plan
// the Sign button is disabled (so not focusable) and says why; on a saved plan it is enabled.
await page.locator("body").focus();
const seen = new Set();
for (let i = 0; i < MAX_TABS * 2; i++) {
  await page.keyboard.press("Tab");
  const f = await focused();
  if (!f) continue;
  if (!f.visible)
    fail(`no visible focus indicator on <${f.tag}> "${f.name.slice(0, 60)}"`);
  const key = `${f.tag}:${f.name}`;
  if (seen.has(key) && i > 5) break;
  seen.add(key);
}
console.log(`✓ tabbed through ${seen.size} controls on the contract review`);
const sign = page.getByRole("button", { name: /Sign v\d+ with passkey/ });
if (
  (await sign.count()) === 1 &&
  (await sign.isDisabled()) &&
  (await page.getByText("Demo contracts aren't stored").count()) === 1
)
  console.log("✓ the demo contract's Sign button is disabled and explains why");
else fail("contract review: Sign button state or its explanation is missing");

// Shift+Tab walks back to the previous stop: no keyboard trap.
await page.keyboard.press("Tab");
const first = await focused();
await page.keyboard.press("Tab");
await page.keyboard.press("Shift+Tab");
const back = await focused();
if (first && back && first.name === back.name)
  console.log("✓ Shift+Tab moves focus back");
else fail(`Shift+Tab went to "${back?.name}", expected "${first?.name}"`);

await browser.close();
process.exit(failures ? 1 : 0);
