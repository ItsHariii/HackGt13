import "server-only";
import { contractHash, hashJson, reportHash } from "@cartel/contracts";
import type { Json } from "@cartel/contracts/db";
import { ShopifyHandoffClient } from "@cartel/payments";
import { consentDiff } from "@cartel/proof-engine";
import { shopify } from "./catalog";
import { loadCheckout } from "./checkout";
import { CheckoutError } from "./checkout-service";
import { ALL_PACKS, sources } from "./evidence";
import { shopifyToken } from "./shopify-auth";
import { catalogListsStore, shopifyCheckoutState } from "./shopify-state";

/** Checkout totals are authoritative; catalog facts stay source_stated. */
export async function handoffCheckout(versionId: string, owner: string) {
  const { db, version, context, allowlisted } = await loadCheckout(
    versionId,
    owner,
    "handoff",
  );
  if (
    !["signed", "armed"].includes(version.status) ||
    Date.parse(version.expires_at) <= Date.now()
  )
    throw new CheckoutError("contract_not_signed");
  const signature = await db
    .from("contract_signatures")
    .select("id")
    .eq("contract_version_id", versionId)
    .eq("body_hash", context.bodyHash)
    .not("verified_at", "is", null)
    .limit(1)
    .maybeSingle();
  if (signature.error || !signature.data)
    throw new CheckoutError("signature_missing");
  const { contract } = context.approved;
  if (
    (await contractHash(contract)) !== context.bodyHash ||
    (await reportHash(context.approved.report)) !== contract.proof.reportHash
  )
    throw new CheckoutError("approval_hash_mismatch");
  const origin = contract.merchants[0]?.origin;
  const profile = process.env.SHOPIFY_AGENT_PROFILE_URL;
  const token = shopifyToken();
  if (!origin || !profile || !token || !sources().has("shopify"))
    throw new CheckoutError("handoff_not_configured", 503);
  // The store must be the one the Shopify Catalog lists for every item,
  // unless it is explicitly allowlisted (SHOPIFY_HANDOFF_ORIGINS).
  const catalog = shopify(AbortSignal.timeout(15000));
  const catalogRead = await catalog.lookup(contract.items.map((i) => i.sku));
  if (!allowlisted && !catalogListsStore(catalogRead, contract.items, origin))
    throw new CheckoutError("merchant_not_configured", 503);
  const client = new ShopifyHandoffClient({
    origin,
    agentProfile: profile,
    accessToken: token,
  });
  const checkout = await client.create(contract.items);
  if (checkout.currency !== contract.economics.currency)
    throw new CheckoutError("checkout_currency_mismatch");
  const now = new Date().toISOString();
  const sourceId = crypto.randomUUID();
  const live = shopifyCheckoutState(
    {
      planId: contract.planId,
      merchantId: contract.merchants[0]?.id ?? "",
      items: contract.items,
    },
    checkout,
    catalogRead,
    now,
    sourceId,
  );
  const { diff, reproof } = await consentDiff(
    context.approved,
    live,
    ALL_PACKS,
    now,
  );
  const unsafe = reproof.results.find(
    (r) =>
      r.importance === "hard" &&
      (r.verdict === "fail" ||
        (r.verdict === "unknown" &&
          !contract.waivers.some(
            (w) => w.requirementId === r.requirementId && w.reason === r.reason,
          ))),
  );
  if (unsafe)
    diff.classification = unsafe.verdict === "fail" ? "block" : "reapprove";
  if (
    checkout.status === "incomplete" ||
    checkout.status === "completed" ||
    checkout.status === "canceled"
  )
    diff.classification = "block";
  // Never imply that unprovided return terms, variant identity or recurring terms were checked.
  if (
    contract.items.some(
      (i) =>
        i.variant ||
        i.recurring ||
        !i.terms.finalSale ||
        i.terms.returnWindowDays !== 0 ||
        i.terms.returnFeeMinor !== 0,
    ) &&
    diff.classification !== "block"
  )
    diff.classification = "reapprove";
  const state = { checkout: live, ucp: checkout };
  const saved = await db.rpc("srv_record_checkout_proof", {
    p_version: versionId,
    p_session: checkout.id,
    p_merchant: contract.merchants[0]?.id ?? "",
    p_state: state as unknown as Json,
    p_hash: await hashJson(state),
    p_diff: diff as unknown as Json,
    p_report: reproof as unknown as Json,
  });
  if (saved.error || !saved.data)
    throw new CheckoutError("checkout_storage_failed", 503);
  if (diff.classification === "block" || diff.classification === "reapprove")
    return {
      status: "paused",
      classification: diff.classification,
      diffId: saved.data,
    };
  const recorded = await db.rpc("srv_record_handoff", {
    p_version: versionId,
    p_diff: saved.data,
    p_url: checkout.continue_url,
  });
  if (recorded.error) throw new CheckoutError("handoff_not_recorded", 503);
  return {
    status: "handed_off",
    url: checkout.continue_url,
    checkedAt: now,
    message: `Re-checked at ${now}. After this, the store's checkout decides.`,
  };
}
