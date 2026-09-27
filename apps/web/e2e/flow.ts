import { expect, type Page } from "@playwright/test";

/*
 * The steps a shopper takes, through the real UI. A virtual authenticator
 * stands in for Touch ID (Chrome DevTools Protocol), so signing is a real
 * WebAuthn ceremony the server verifies.
 */

export async function virtualPasskey(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
}

/** The first visit signs in anonymously in the browser; wait for its cookie. */
export async function startSession(page: Page) {
  await page.goto("/");
  await expect
    .poll(
      async () =>
        (await page.context().cookies()).some((c) =>
          /^sb-.+-auth-token/.test(c.name),
        ),
      { timeout: 60_000 },
    )
    .toBe(true);
}

/** Registers the signing passkey (Settings → Signing). */
export async function addSigningKey(page: Page) {
  await page.goto("/settings/signing");
  await page.getByRole("button", { name: "Add signing key" }).click();
  await expect(page.getByText("Signing key added.")).toBeVisible();
}

/** Adds the Simulated payment method (Settings → Payment). */
export async function addSimulatedCard(page: Page) {
  await page.goto("/settings/payment");
  await page.getByRole("button", { name: "Add simulated method" }).click();
  await expect(page.getByText(/simulated/i).first()).toBeVisible();
}

/** Kits → Make it mine → Find plans: returns the new plan's ID once Plans A–C show. */
export async function forkAndSolve(page: Page): Promise<string> {
  await page.goto("/kits/starter-home-office");
  await page.getByRole("button", { name: "Make it mine" }).click();
  await page.waitForURL(/\/plans\/[0-9a-f-]{36}\/requirements$/);
  const planId = page.url().split("/").at(-2) as string;
  await page.getByRole("button", { name: "Find plans" }).click();
  await expect(page.getByRole("tab", { name: "Plan A" })).toBeVisible({
    timeout: 120_000,
  });
  return planId;
}

/** Review contract → address, waivers → Draft → the contract awaiting signature. */
export async function draftContract(page: Page, planId: string) {
  await page.getByRole("link", { name: "Review contract" }).first().click();
  await page.waitForURL(new RegExp(`/plans/${planId}/contract/new`));
  await page.getByLabel("Full name").fill("Test Shopper");
  await page.getByLabel("Address line 1").fill("1 Test Way");
  await page.getByLabel("City").fill("Atlanta");
  await page.getByLabel("State").fill("GA");
  await page.getByLabel("ZIP code").fill("30332");
  for (const box of await page.getByRole("checkbox").all()) await box.check();
  await page.getByRole("button", { name: "Draft the contract" }).click();
  await page.waitForURL(new RegExp(`/plans/${planId}/contract$`), {
    timeout: 120_000,
  });
}

export async function sign(page: Page) {
  // The contract asks again, on the page being signed, for each waiver.
  for (const box of await page
    .getByRole("checkbox", { name: "I accept this." })
    .all())
    await box.check();
  await page.getByRole("button", { name: "Sign with passkey" }).click();
  await expect(page.getByText(/SIGNED v\d+/)).toBeVisible();
}

/** Checkout → Check and pay; returns the message the panel settles on. */
export async function pay(page: Page, planId: string) {
  await page.goto(`/plans/${planId}/checkout`);
  const button = page.getByRole("button", { name: /^Check and pay/ });
  await expect(button).toBeEnabled();
  await button.click();
  // The button goes away once paid; the panel's status line carries the outcome.
  await expect(
    page.getByRole("status").filter({
      hasText: /Payment authorized|PURCHASE PAUSED|Payment declined|unresolved/,
    }),
  ).toBeVisible({ timeout: 120_000 });
}
