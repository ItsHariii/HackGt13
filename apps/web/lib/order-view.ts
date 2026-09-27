import { ContractBody } from "@cartel/contracts";
import { formatMoneyText } from "@cartel/proof-engine";
import type { GuardStep } from "@/components/cartel/guard-stepper";
import { formatStamp } from "./contract-view";
import type { OrderView } from "./flagship";

/** What the receipt reads from a stored order and the contract it paid for. */
export type StoredOrderRow = {
  id: string;
  merchantId: string;
  merchantOrderId: string;
  status: string;
  totalMinor: number;
  currency: string;
  createdAt: string;
  rail: string | null;
  card: { brand: string | null; last4: string | null } | null;
  planId: string;
  planTitle: string | null;
  contractVersion: number;
  contractHash: string;
  contractBody: unknown;
  signedAt: string | null;
  hard: { pass: number; fail: number; unknown: number } | null;
};

const PROCESSOR: Record<string, string> = {
  visa_acceptance: "Visa Acceptance sandbox",
  authorize_net: "Authorize.net sandbox",
  vic: "Visa Intelligent Commerce",
  simulated: "Simulated payment",
};
const MERCHANT: Record<string, string> = {
  greathub: "GreatHub (test merchant)",
};
const RECEIPT_STATUS: Record<string, string> = {
  created: "AUTHORIZED",
  manual_review: "IN REVIEW",
  confirmed: "CONFIRMED",
  canceled: "CANCELED",
  shipped: "SHIPPED",
  fulfilled: "DELIVERED",
};
const PROGRESS = ["confirmed", "shipped", "fulfilled"];

function steps(row: StoredOrderRow, proved: string): GuardStep[] {
  const reached = PROGRESS.indexOf(row.status);
  const at = (i: number): GuardStep["state"] =>
    i <= reached ? "done" : i === reached + 1 ? "current" : "pending";
  if (row.status === "canceled")
    return [
      { label: "Re-checked", state: "done", meta: proved },
      { label: "Paid", state: "done", meta: formatStamp(row.createdAt) },
      { label: "Canceled", state: "failed", meta: "Canceled by the merchant" },
    ];
  return [
    { label: "Re-checked", state: "done", meta: proved },
    { label: "Paid", state: "done", meta: formatStamp(row.createdAt) },
    {
      label: "Confirmed",
      state: at(0),
      meta: reached >= 0 ? "Merchant confirmed" : "Pending · merchant",
    },
    {
      label: "Shipped",
      state: at(1),
      meta: reached >= 1 ? "Shipped" : "Pending",
    },
    {
      label: "Delivered",
      state: at(2),
      meta: reached >= 2 ? "Delivered" : "Pending",
    },
  ];
}

/**
 * The paid receipt for a stored order. Lines, shipping and tax come from the
 * signed contract; the total is what was charged. If they differ, one line
 * says so, so the receipt still adds up.
 */
export function storedOrderView(row: StoredOrderRow): OrderView {
  const money = (m: number) => formatMoneyText(m, row.currency);
  const parsed = ContractBody.safeParse(row.contractBody);
  const contract = parsed.success ? parsed.data : null;
  const lines = (contract?.items ?? []).map((i) => ({
    label: i.qty > 1 ? `${i.title} × ${i.qty}` : i.title,
    amount: money(i.unitPriceMinor * i.qty),
  }));
  const shipping = contract?.economics.shippingMinor ?? 0;
  const tax = contract?.economics.taxEstimateMinor ?? 0;
  const expected =
    (contract?.items ?? []).reduce(
      (sum, i) => sum + i.unitPriceMinor * i.qty,
      0,
    ) +
    shipping +
    tax;
  if (contract && expected !== row.totalMinor)
    lines.push({
      label: "Adjusted at checkout",
      amount: money(row.totalMinor - expected),
    });
  const hard = row.hard;
  const proof = hard
    ? `${hard.pass} of ${hard.pass + hard.unknown + hard.fail} hard rules passed${hard.unknown ? ` · ${hard.unknown} can't check (waived)` : ""}`
    : "—";
  const terms = contract?.items[0]?.terms;
  const card = row.card?.last4
    ? ` · ${row.card.brand ?? "Card"} •••• ${row.card.last4}`
    : "";
  return {
    id: row.merchantOrderId,
    planId: row.planId,
    title: row.planTitle ?? `Order ${row.merchantOrderId}`,
    merchant: MERCHANT[row.merchantId] ?? row.merchantId,
    when: formatStamp(row.createdAt),
    lines,
    shipping: money(shipping),
    tax: money(tax),
    total: money(row.totalMinor),
    processor: `${PROCESSOR[row.rail ?? ""] ?? row.rail ?? "—"}${card}`,
    status: RECEIPT_STATUS[row.status] ?? row.status.toUpperCase(),
    contractVersion: row.contractVersion,
    contractHash: row.contractHash,
    proof,
    signed: row.signedAt ? formatStamp(row.signedAt) : "—",
    returnPolicy: terms
      ? terms.finalSale
        ? "Final sale"
        : `${terms.returnWindowDays}-day returns · ${terms.returnFeeMinor ? money(terms.returnFeeMinor) : "free"}`
      : "—",
    steps: steps(row, hard ? `${hard.pass} hard rules pass` : "Re-checked"),
  };
}
