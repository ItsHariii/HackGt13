import "server-only";
import { normalizeProduct } from "@cartel/catalog";
import {
  contractHash,
  type Fact,
  hashJson,
  type Offer,
  reportHash,
} from "@cartel/contracts";
import type { Json } from "@cartel/contracts/db";
import { toDrafts } from "@cartel/evidence";
import { ShopifyHandoffClient } from "@cartel/payments";
import {
  type CheckoutState,
  consentDiff,
  fieldDef,
} from "@cartel/proof-engine";
import { shopify } from "./catalog";
import { loadCheckout } from "./checkout";
import { CheckoutError } from "./checkout-service";
import { ALL_PACKS, sources } from "./evidence";

/** Checkout totals are authoritative; catalog facts stay source_stated. */
export async function handoffCheckout(versionId: string, owner: string) {
  const { db, version, context } = await loadCheckout(
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
  const token = process.env.SHOPIFY_ACCESS_TOKEN;
  if (!origin || !profile || !token || !sources().has("shopify"))
    throw new CheckoutError("handoff_not_configured", 503);
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
  const catalog = shopify(AbortSignal.timeout(15000));
  const catalogRead = await catalog.lookup(
    checkout.line_items.map((line) => line.item.id),
  );
  const products = catalogRead.products.map((p) =>
    normalizeProduct(p, ALL_PACKS),
  );
  const offers: Offer[] = [];
  const facts: Fact[] = [];
  const lines: CheckoutState["basket"]["lines"] = [];
  for (const [i, line] of checkout.line_items.entries()) {
    const signed =
      contract.items.find((item) => item.sku === line.item.id) ??
      contract.items[i];
    const product = products.find((p) =>
      p.offers.some((o) => o.externalId === line.item.id),
    );
    const catalogOffer = product?.offers.find(
      (o) => o.externalId === line.item.id,
    );
    const subtotal = line.totals.find((t) => t.type === "subtotal")?.amount;
    const price =
      line.item.price ??
      (subtotal !== undefined && subtotal % line.quantity === 0
        ? subtotal / line.quantity
        : undefined);
    if (!signed || !product || !catalogOffer || price === undefined)
      throw new CheckoutError("handoff_evidence_missing");
    const id = line.item.id;
    const productId = product.externalId;
    const sellerId = catalogOffer.sellerId ?? catalogOffer.merchantId;
    offers.push({
      id,
      productId,
      merchant: contract.merchants[0]?.id ?? "",
      sellerId,
      sku: id,
      title: product.title,
      ...(product.gtin ? { gtin: product.gtin } : {}),
      price: { amountMinor: price, currency: checkout.currency },
      availability: "unknown",
      tier: "handoff",
      // UCP core does not assert return terms. Conservative envelope; missing facts remain unknown.
      terms: { finalSale: true, returnWindowDays: 0, returnFeeMinor: 0 },
    });
    lines.push({ role: signed.role, offerId: id, qty: line.quantity });
    facts.push(
      ...toDrafts(
        product.facts.filter((c) => !c.offerKey || c.offerKey === id),
        (c) => ({
          kind: c.offerKey ? "offer" : "product",
          id: c.offerKey ? id : productId,
        }),
        catalogRead.source,
        (field) => fieldDef(field, ALL_PACKS),
      ).map((f, n) => ({ ...f, id: `${id}:${n}`, conflict: false })),
    );
    facts.push({
      id: `price:${id}`,
      subjectKind: "offer",
      subjectId: id,
      field: "offer.price",
      value: { amountMinor: price, currency: checkout.currency },
      state: "verified",
      conflict: false,
      sourceId,
      extractor: "ucp_checkout",
      retrievedAt: now,
    });
  }
  const amount = (type: string) => {
    const totals = checkout.totals.filter((t) => t.type === type);
    if (totals.length !== 1) throw new CheckoutError("handoff_totals_missing");
    return { amountMinor: totals[0]?.amount ?? 0, currency: checkout.currency };
  };
  const live: CheckoutState = {
    basket: { id: contract.planId, lines },
    offers,
    facts,
    sources: {
      [sourceId]: { authority: "merchant_checkout" },
      [catalogRead.source.id]: { authority: "catalog" },
    },
    quotes: [
      {
        merchant: contract.merchants[0]?.id ?? "",
        shipping: amount("fulfillment"),
        tax: amount("tax"),
        total: amount("total"),
        state: "verified",
        factId: sourceId,
        retrievedAt: now,
      },
    ],
  };
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
