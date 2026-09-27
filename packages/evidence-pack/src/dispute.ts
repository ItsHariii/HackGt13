import type { ContractBody, Hash } from "@cartel/contracts";
import { type DeliveryItem, deliveryItems, normalizeGtin } from "./delivery";

/*
 * The dispute packet (SDD §15, TASKS T15.4): after a mismatch, one structured
 * summary of what was approved (signed), what the facts were at purchase
 * (snapshots), and what arrived (the scan). The same document serves the
 * merchant as proof of exactly what the customer approved.
 */

export type FactRow = {
  label: string;
  value: string;
  /** Evidence state at purchase: verified, estimated, unknown… */
  state: string;
  source: string;
  retrievedAt: string | null;
};

export type ItemFacts = { sku: string; facts: FactRow[] };

export type DisputeScan = {
  gtin: string;
  method: "scan" | "typed";
  at: string;
  /** Ledger sequence of the `delivery.mismatched` event, when stored. */
  ledgerSeq: number | null;
};

export type DisputeInput = {
  orderId: string;
  merchantOrderId: string;
  merchant: string;
  contract: ContractBody;
  contractHash: Hash;
  signedAt: string | null;
  paidAt: string | null;
  totalMinor: number;
  factsAtPurchase: readonly ItemFacts[];
  scans: readonly DisputeScan[];
};

export type DisputePacket = {
  orderId: string;
  merchantOrderId: string;
  merchant: string;
  /** Card-network framing of the claim. */
  category: "Merchandise not as described";
  approved: {
    version: number;
    contractHash: Hash;
    signedAt: string | null;
    paidAt: string | null;
    totalMinor: number;
    currency: string;
    items: (DeliveryItem & { unitPriceMinor: number })[];
  };
  factsAtPurchase: (ItemFacts & { title: string })[];
  received: (DisputeScan & {
    matched: DeliveryItem | null;
  })[];
  /** Approved items no scan has matched yet. */
  missing: DeliveryItem[];
  findings: string[];
};

export function buildDisputePacket(input: DisputeInput): DisputePacket {
  const items = deliveryItems(input.contract.items);
  const received = input.scans.map((s) => {
    const gtin = normalizeGtin(s.gtin) ?? s.gtin;
    return { ...s, gtin, matched: items.find((i) => i.gtin === gtin) ?? null };
  });
  const matchedSkus = new Set(
    received.flatMap((r) => (r.matched ? [r.matched.sku] : [])),
  );
  const missing = items.filter((i) => !matchedSkus.has(i.sku));
  const unexpected = received.filter((r) => !r.matched);

  const findings: string[] = [];
  for (const r of unexpected)
    findings.push(
      `Received GTIN ${r.gtin}, which is not an item approved in contract v${input.contract.version}.`,
    );
  const unscanned = missing.filter((m) => m.gtin);
  if (unscanned.length)
    findings.push(
      `Not scanned as received yet: ${unscanned.map((m) => `${m.title} (GTIN ${m.gtin})`).join("; ")}.`,
    );
  const noGtin = missing.filter((m) => !m.gtin);
  if (noGtin.length)
    findings.push(
      `No GTIN in the contract, so a scan can't confirm: ${noGtin.map((m) => m.title).join("; ")}.`,
    );
  if (!findings.length)
    findings.push("Every scan matches an approved item. No mismatch found.");

  return {
    orderId: input.orderId,
    merchantOrderId: input.merchantOrderId,
    merchant: input.merchant,
    category: "Merchandise not as described",
    approved: {
      version: input.contract.version,
      contractHash: input.contractHash,
      signedAt: input.signedAt,
      paidAt: input.paidAt,
      totalMinor: input.totalMinor,
      currency: input.contract.economics.currency,
      items: items.map((i) => ({
        ...i,
        unitPriceMinor:
          input.contract.items.find((c) => c.sku === i.sku)?.unitPriceMinor ??
          0,
      })),
    },
    factsAtPurchase: input.factsAtPurchase.map((f) => ({
      ...f,
      title: items.find((i) => i.sku === f.sku)?.title ?? f.sku,
    })),
    received,
    missing,
    findings,
  };
}
