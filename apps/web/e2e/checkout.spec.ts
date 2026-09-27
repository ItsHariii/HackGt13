import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { GREATHUB } from "./env";
import {
  addSigningKey,
  addSimulatedCard,
  draftContract,
  forkAndSolve,
  pay,
  sign,
  startSession,
  virtualPasskey,
} from "./flow";

/*
 * TASKS T16.6. Happy path: a kit becomes Plans A–C, the contract is
 * drafted from a real GreatHub checkout, signed with a passkey and paid on
 * the Simulated rail. Trap path: after signing, GreatHub raises a price;
 * the guard re-proves at checkout and pauses with no payment.
 */

test.beforeEach(async ({ page }) => {
  await virtualPasskey(page);
  await startSession(page);
  await addSigningKey(page);
  await addSimulatedCard(page);
});

test("kit → plans → contract → passkey → paid order", async ({ page }) => {
  const planId = await forkAndSolve(page);
  await expect(page.getByText(/hard rules pass/)).toBeVisible();
  await draftContract(page, planId);
  await sign(page);
  await pay(page, planId);
  await expect(
    page.getByText("Payment authorized. Your order is recorded."),
  ).toBeVisible();
  // Each guard step reported its own result.
  await expect(page.getByText(/ready_for_payment · \d+/)).toBeVisible();
  await page.goto(`/ledger/${planId}`);
  await expect(
    page.getByText(/payment\.authorized|Payment authorized/i).first(),
  ).toBeVisible();
});

test("a price raised after signing pauses checkout; nothing is paid", async ({
  page,
  request,
}) => {
  const planId = await forkAndSolve(page);
  await draftContract(page, planId);
  await sign(page);
  // Raise the price of the first item in the signed basket on GreatHub.
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SECRET_KEY as string,
    { auth: { persistSession: false } },
  );
  const signed = await db
    .from("contract_versions")
    .select("body")
    .eq("plan_id", planId)
    .eq("status", "signed")
    .single();
  const sku = (signed.data?.body as { items: { sku: string }[] } | undefined)
    ?.items[0]?.sku;
  expect(sku).toBeTruthy();
  const raised = await request.post(`${GREATHUB}/api/chaos/mutations`, {
    headers: {
      authorization: `Bearer ${process.env.CHAOS_ADMIN_TOKEN}`,
      "content-type": "application/json",
    },
    data: { mutation: "price_raise", sku, params: { priceMinor: 199_900 } },
  });
  expect(raised.status()).toBe(201);
  await pay(page, planId);
  await expect(
    page.getByText(/PURCHASE PAUSED · NO PAYMENT WAS MADE/),
  ).toBeVisible();
  // Reset GreatHub so the next run starts from the seeded catalog.
  await request.post(`${GREATHUB}/api/chaos/reset`, {
    headers: { authorization: `Bearer ${process.env.CHAOS_ADMIN_TOKEN}` },
  });
});
