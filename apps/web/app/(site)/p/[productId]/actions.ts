"use server";
import { AutonomyPreset } from "@cartel/contracts";
import { redirect } from "next/navigation";
import { userId } from "@/lib/catalog";
import { ContractDraftError } from "@/lib/contract-draft";
import { logger } from "@/lib/logger";
import { limitCurrentRequest } from "@/lib/rate-limit";
import { draftShopifyContract } from "@/lib/shopify-draft";

export type BuyState = { error: string | null };

const MESSAGE: Record<string, string> = {
  not_found:
    "The Shopify Catalog no longer lists this item at this store. Nothing was drafted.",
  merchant_unavailable:
    "The store's checkout didn't answer, or Shopify hand-off isn't set up here. Nothing was drafted.",
  over_budget:
    "The store's checkout total is over your maximum. Raise it or pick another store.",
  unwaived:
    "The store's checkout didn't confirm the total, so it can't be checked. Nothing was drafted.",
  storage: "The contract couldn't be saved. Nothing was signed.",
};

/** Buy from this store (TASKS T13.10): draft a hand-off contract, then sign it. */
export async function buyFromStore(
  _prev: BuyState,
  form: FormData,
): Promise<BuyState> {
  const sku = String(form.get("sku") ?? "");
  const qty = Number(form.get("qty") ?? 1);
  const max = Number(form.get("max") ?? 0);
  const preset = AutonomyPreset.safeParse(String(form.get("preset") ?? ""));
  if (
    !sku ||
    sku.length > 1000 ||
    !Number.isInteger(qty) ||
    qty < 1 ||
    qty > 20 ||
    !Number.isFinite(max) ||
    max <= 0 ||
    max > 100_000 ||
    !preset.success
  )
    return { error: "Check the quantity and your maximum total." };
  const quota = await limitCurrentRequest("solve");
  if (!quota.allowed)
    return {
      error: `Too many drafts in a row. Try again in ${Math.ceil(quota.retryAfterMs / 1000)} seconds.`,
    };
  let planId: string;
  try {
    planId = await draftShopifyContract({
      owner: await userId(),
      sku,
      qty,
      maxTotalMinor: Math.round(max * 100),
      preset: preset.data,
    });
  } catch (err) {
    if (err instanceof ContractDraftError)
      return { error: MESSAGE[err.code] ?? (MESSAGE.storage as string) };
    logger.error({ err }, "store contract draft failed");
    return { error: MESSAGE.storage as string };
  }
  redirect(`/plans/${planId}/contract`);
}
