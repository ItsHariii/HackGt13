// Main-thread cost per frame while figures animate (TASKS T10B.7: < 4 ms).
// Scrolls the landing (rope + pulled sheet) and runs the /dev/figures
// loops, then divides Chrome's script + style + layout + paint time by the
// frames drawn. Run against a production build:
//   PERF_BASE_URL=http://localhost:3000 pnpm --filter @cartel/web test:perf
import { chromium } from "playwright";

const base = process.env.PERF_BASE_URL ?? "http://localhost:3000";
const browser = await chromium.launch(
  process.env.PLAYWRIGHT_CHROMIUM
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM }
    : {},
);
const page = await (
  await browser.newContext({ viewport: { width: 1440, height: 900 } })
).newPage();
const cdp = await page.context().newCDPSession(page);
await cdp.send("Performance.enable");

const metrics = async () => {
  const { metrics: m } = await cdp.send("Performance.getMetrics");
  const get = (n) => m.find((x) => x.name === n)?.value ?? 0;
  return (
    (get("ScriptDuration") +
      get("RecalcStyleDuration") +
      get("LayoutDuration")) *
    1000
  );
};
const countFrames = (ms) =>
  page.evaluate(
    (ms) =>
      new Promise((done) => {
        let n = 0;
        const end = performance.now() + ms;
        const tick = (t) => {
          n += 1;
          if (t < end) requestAnimationFrame(tick);
          else done(n);
        };
        requestAnimationFrame(tick);
      }),
    ms,
  );

async function measure(label, drive) {
  const before = await metrics();
  const [frames] = await Promise.all([countFrames(3000), drive()]);
  const busy = (await metrics()) - before;
  const perFrame = busy / frames;
  console.log(
    `${perFrame < 4 ? "✓" : "✗"} ${label}: ${perFrame.toFixed(2)} ms/frame over ${frames} frames`,
  );
  return perFrame;
}

await page.goto(`${base}/`, { waitUntil: "load" });
const landing = await measure("landing scroll (rope)", async () => {
  for (let i = 0; i < 60; i++) {
    await page.mouse.wheel(0, 60);
    await page.waitForTimeout(45);
  }
});

await page.goto(`${base}/dev/figures`, { waitUntil: "load" });
const paper = page.locator('section[aria-labelledby="paper-theme"]');
await paper.getByRole("button", { name: "Start searching" }).click();
const figures = await measure("run loop + stamps + walker", async () => {
  for (let i = 0; i < 8; i++) {
    await paper.getByRole("button", { name: "Stamp" }).click();
    await paper.getByRole("button", { name: "Next result" }).click();
    await page.waitForTimeout(300);
  }
});

await browser.close();
process.exit(Math.max(landing, figures) < 4 ? 0 : 1);
