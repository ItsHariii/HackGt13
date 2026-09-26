import type { CheckoutTier } from "@/components/cartel/checkout-tier-badge";
import type { DiffLine } from "@/components/cartel/contract-diff";
import type { GuardStep } from "@/components/cartel/guard-stepper";
import type { Layer } from "@/components/cartel/layers-table";
import type { LedgerEntry } from "@/components/cartel/ledger-timeline";
import type { MerchantStatus } from "@/components/cartel/merchant-status-table";
import type { ProductCardData } from "@/components/cartel/product-card";
import type { ProofRowData, Tick } from "@/components/cartel/proof";
import type { SpecReceipt } from "@/components/cartel/spec-receipt-row";

/*
 * Example data for the component sheet (/dev/components) and the landing
 * page, copied from the designs (docs/DESIGN.md). Illustrative only: no
 * screen shows these as a real plan's results.
 */

export const hashV7 =
  "sha256:7c1e0f5b2d9a44e1b8c3f6a7d2e90b14c5f83a6e7d1b2c9f04a8e6d3b5c1a94f";
export const hashV8 =
  "sha256:b04d8e2a61f7c3d9e5b0a4f6c8d2e1b7a9f3c5e0d6b8a2f4c1e7d9b3a5f619e2";

export const ticks: Tick[] = [
  "pass",
  "pass",
  "pass",
  "pass",
  "pass",
  "pass",
  "pass",
  "pass",
  "waived",
];

export const proofRows: ProofRowData[] = [
  {
    id: "total",
    rule: "Delivered total ≤ $1,000",
    status: "pass",
    value: "$896.05",
    evidence: "confirmed",
    evidenceDetail: "GreatHub checkout · just now",
  },
  {
    id: "usbc",
    rule: "Monitor USB-C power ≥ 65 W",
    status: "pass",
    value: "up to 90 W",
    evidence: "seller",
    evidenceDetail: "GreatHub",
  },
  {
    id: "usbc-now",
    rule: "Monitor USB-C power ≥ 65 W (now)",
    status: "fail",
    value: "15 W",
    evidence: "seller",
    evidenceDetail: "GreatHub · 12 s ago",
  },
  {
    id: "arrive",
    rule: "Latest delivery by Mon Sep 28",
    status: "estimate",
    value: "Sat Sep 26",
    evidence: "estimate",
  },
  {
    id: "chair",
    rule: "Chair comfort",
    status: "unknown",
    statusLabel: "Can't check · waived",
    value: "—",
    evidence: "cant",
  },
];

export const plans: {
  label: string;
  itemCount: number;
  total: string;
  passed: number;
  hardRules: number;
  tier: CheckoutTier;
}[] = [
  {
    label: "Plan A · Balanced",
    itemCount: 5,
    total: "$896.05",
    passed: 12,
    hardRules: 12,
    tier: "full",
  },
  {
    label: "Plan B · Cheapest",
    itemCount: 5,
    total: "$851.40",
    passed: 11,
    hardRules: 12,
    tier: "full",
  },
  {
    label: "Plan C · Fastest",
    itemCount: 5,
    total: "$948.10",
    passed: 12,
    hardRules: 12,
    tier: "handoff",
  },
];

export const products: ProductCardData[] = [
  {
    id: "harbor",
    name: "Harbor Linen Shirt, Navy",
    price: "$68.00",
    fact: "100% linen",
    evidence: "seller",
    source: "Shopify Catalog",
    tier: "handoff",
  },
  {
    id: "tidewater",
    name: "Tidewater Camp Shirt",
    price: "$74.00",
    fact: "Linen (likely)",
    evidence: "suggests",
    source: "Shopify Catalog",
    tier: "handoff",
  },
  {
    id: "marlow",
    name: "Marlow Linen Popover, Navy",
    price: "$58.00",
    fact: "100% linen",
    evidence: "manufacturer",
    source: "GreatHub (test merchant)",
    tier: "full",
  },
];

export const specs: SpecReceipt[] = [
  {
    spec: "Screen size",
    value: "27 in",
    evidence: "manufacturer",
    source: "Icecat",
    checked: "3 min ago",
  },
  {
    spec: "USB-C power delivery",
    value: "65 W",
    evidence: "manufacturer",
    source: "Icecat",
    checked: "3 min ago",
  },
  {
    spec: "Width",
    value: "24.1 in",
    evidence: "seller",
    source: "GreatHub",
    checked: "12 s ago",
  },
  {
    spec: "Refresh rate",
    value: "60 Hz / 75 Hz",
    evidence: "disagree",
    source: "GreatHub · UPCitemdb",
    checked: "1 min ago",
  },
  {
    spec: "Price",
    value: "$309.00",
    evidence: "confirmed",
    source: "GreatHub checkout",
    checked: "12 s ago",
  },
];

export const layers: Layer[] = [
  {
    name: "Cart hash (SKU, qty, price)",
    status: "pass",
    detail: "unchanged SKU U2727",
  },
  { name: "Merchant", status: "pass", detail: "GreatHub" },
  { name: "Amount within max", status: "pass", detail: "$881.07 ≤ $910.00" },
  {
    name: "Cartel re-check",
    status: "fail",
    detail: "USB-C power 15 W < 65 W required",
  },
];

export const diff: DiffLine[] = [
  {
    kind: "ctx",
    label: "Desk",
    text: 'Birchline Compact Desk 46.5"',
    amount: "$229.00",
  },
  {
    kind: "ctx",
    label: "Chair",
    text: "Kestrel Mesh Task Chair",
    amount: "$189.00",
  },
  {
    kind: "del",
    label: "Monitor",
    text: "Vireo U2727 · USB-C 90 W → listing changed to 15 W",
    amount: "$329.00",
  },
  {
    kind: "add",
    label: "Monitor",
    text: "Halden M27Q-USBC · USB-C 65 W",
    amount: "$309.00",
  },
  { kind: "gap" },
  { kind: "del", label: "Delivered total", text: "", amount: "$891.77" },
  { kind: "add", label: "Delivered total", text: "", amount: "$870.37" },
  { kind: "del", label: "Maximum total", text: "", amount: "$910.00" },
  { kind: "add", label: "Maximum total", text: "", amount: "$885.00" },
];

export const merchants: MerchantStatus[] = [
  {
    merchant: "GreatHub (test merchant)",
    items: 4,
    tier: "full",
    status: "pass",
    statusLabel: "Paid",
    total: "$801.37",
  },
  {
    merchant: "Harbor Supply Co.",
    items: 1,
    tier: "handoff",
    status: "info",
    statusLabel: "Handed off",
    total: "$69.00",
  },
];

export const orderSteps: GuardStep[] = [
  { label: "Re-checked", state: "done", meta: "12 / 12 hard rules pass" },
  { label: "Paid", state: "done", meta: "Sep 26, 10:44" },
  { label: "Confirmed", state: "current", meta: "Pending · merchant" },
  { label: "Shipped", state: "pending", meta: "Pending" },
];

export const ledger: LedgerEntry[] = [
  {
    seq: 1,
    time: "10:31:02",
    actor: "you",
    type: "plan.created",
    description: "Home office plan started from your brief.",
    hash: "sha256:3a91c4e2b7d0f5a8c1e6b9d2f4a7c03e5b8d1f6a9c2e4b7d0f3a5c8e1b6d07c2",
  },
  {
    seq: 2,
    time: "10:31:09",
    actor: "ai",
    type: "requirements.extracted",
    description:
      "9 rules drafted: 5 you said, 2 assumed, 1 default, 1 can't check.",
    hash: "sha256:8d04a7c1e9b2f5d8a3c6e0b4f7d1a9c2e5b8f3d6a0c4e7b1d9f2a5c8e3b6b1e5",
  },
  {
    seq: 3,
    time: "10:42:00",
    actor: "you",
    type: "contract.signed",
    description: "v7 · Signed with passkey · max $910.00.",
    hash: hashV7,
  },
  {
    seq: 4,
    time: "10:43:18",
    actor: "sys",
    type: "execution.blocked",
    description:
      "Same SKU U2727: USB-C power 90 W → 15 W. Rule ≥ 65 W fails. Would have charged $881.07.",
    hash: "sha256:f41c7b2e9d5a3c8f1e6b0d4a7c2f9e5b3d8a1c6f0e4b7d2a9c5f3e8b1d62a77",
    blocked: true,
  },
  {
    seq: 5,
    time: "10:44:05",
    actor: "mer",
    type: "payment.authorized",
    description: "Visa Acceptance sandbox · $870.37 · AUTHORIZED.",
    hash: "sha256:29a8e5c1f7b3d9a6c2e8f4b0d7a3c9e5f1b6d2a8c4e0f7b3d9a5c1e6f2b8d0f3",
  },
];
