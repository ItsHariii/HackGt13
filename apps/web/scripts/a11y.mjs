// axe-core accessibility check for the Phase 10 pages (TASKS T10.3: every
// component axe-clean in both themes). Run against a running app:
//   pnpm --filter @cartel/web build && pnpm --filter @cartel/web start
//   A11Y_BASE_URL=http://localhost:3000 pnpm --filter @cartel/web test:a11y
// Set PLAYWRIGHT_CHROMIUM to a Chromium binary if Playwright's own isn't installed.
import AxeBuilder from "@axe-core/playwright";
import { chromium } from "playwright";

const base = process.env.A11Y_BASE_URL ?? "http://localhost:3000";
const pages = [
  ["/dev/components", "light"],
  ["/dev/layouts", "light"],
  ["/dev/figures", "light"],
  ["/this-page-does-not-exist", "light"],
  ["/", "light"],
  ["/trust", "light"],
  ["/settings/signing", "light"],
  ["/plans/flagship", "light"],
  ["/plans/flagship", "dark"],
];
const viewports = [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
];

const browser = await chromium.launch(
  process.env.PLAYWRIGHT_CHROMIUM
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM }
    : {},
);
let failures = 0;
for (const [path, theme] of pages) {
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport });
    await context.addInitScript((t) => {
      try {
        localStorage.setItem("theme", t);
      } catch {}
    }, theme);
    const page = await context.newPage();
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(base + path, { waitUntil: "load" });
    await page.waitForTimeout(1000);
    const { violations } = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    const label = `${path} (${theme}, ${viewport.width}px)`;
    if (violations.length === 0) console.log(`✓ ${label}`);
    for (const v of violations) {
      failures += 1;
      console.log(`✗ ${label}: ${v.id} — ${v.help}`);
      for (const n of v.nodes.slice(0, 5))
        console.log(
          `    ${n.target.join(" ")}: ${n.failureSummary?.split("\n")[1] ?? ""}`,
        );
    }
    await context.close();
  }
}
await browser.close();
process.exit(failures ? 1 : 0);
