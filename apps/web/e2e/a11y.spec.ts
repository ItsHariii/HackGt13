import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { forkAndSolve, startSession } from "./flow";

/*
 * Accessibility of the saved-plan screens (TASKS T16.6, T17.5): no critical
 * or serious axe violations on the solved workspace, compare, the contract
 * draft form and checkout. Static routes are covered by scripts/a11y.mjs.
 */

async function axe(page: Page, what: string) {
  // Metadata streams in after a client-side navigation; the title must arrive.
  await expect.poll(() => page.title(), { timeout: 15_000 }).not.toBe("");
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const serious = violations
    .filter((v) => v.impact === "critical" || v.impact === "serious")
    .map((v) => `${what}: ${v.id} (${v.nodes.length}) ${v.help}`);
  expect(serious).toEqual([]);
}

test("saved-plan screens have no serious accessibility violations", async ({
  page,
}) => {
  await startSession(page);
  const planId = await forkAndSolve(page);
  await axe(page, "workspace");
  await page.goto(`/plans/${planId}/compare`);
  await expect(
    page.getByRole("heading", { name: "Compare plans" }),
  ).toBeVisible();
  await axe(page, "compare");
  await page.goto(`/plans/${planId}/contract/new?plan=A`);
  await expect(
    page.getByRole("heading", { name: "Draft the contract" }),
  ).toBeVisible();
  await axe(page, "draft form");
});
