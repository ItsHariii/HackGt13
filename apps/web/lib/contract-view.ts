import {
  type ContractBody,
  effectiveImportance,
  type ProofReport,
  reasonLabel,
} from "@cartel/contracts";
import {
  fieldDef,
  formatDate,
  formatMoneyText,
  formatValue,
  type Pack,
  signGate,
} from "@cartel/proof-engine";
import type { DiffLine } from "@/components/cartel/contract-diff";
import { ruleText } from "./workspace";

/*
 * A contract version as the contract screen shows it (TASKS T11.6, design
 * "Contract v2"). Every line comes from the signed body and the report it
 * names; nothing here decides a verdict.
 */

export type ContractRuleView = {
  id: string;
  text: string;
  status: "pass" | "fail" | "cant";
  /** An unknown the contract waives. */
  waived: boolean;
  /** Only an unknown can be waived; a fail must be edited. */
  waivable: boolean;
  reason: string | null;
};

export type ContractView = {
  planId: string;
  title: string;
  version: number;
  number: string;
  hash: string;
  parentHash: string | null;
  signedAt: string | null;
  intent: string;
  merchant: string;
  items: {
    role: string;
    title: string;
    sku: string;
    seller: string;
    qty: number;
    unit: string;
  }[];
  rules: ContractRuleView[];
  preferences: string[];
  economics: {
    merchandise: string;
    shipping: string;
    tax: string;
    total: string;
    max: string;
    totalMinor: number;
    maxMinor: number;
  };
  autonomy: "strict" | "balanced" | "flexible";
  mandate: { text: string; trigger: string; notAfter: string } | null;
  issued: string;
  expires: string;
  canSign: boolean;
  blockers: string[];
};

const MERCHANT: Record<string, string> = {
  greathub: "GreatHub (test merchant)",
};

const PACK_CODE: Record<string, string> = {
  "home-office": "HO",
  apparel: "AP",
  travel: "TR",
};

/** "Sep 26, 14:02 UTC" — fixed English, UTC, like the engine's own formatting. */
export function formatStamp(iso: string): string {
  const d = new Date(iso);
  const [, month = "", day = ""] = formatDate(iso).split(" ");
  return `${month} ${day}, ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")} UTC`;
}

/** "CT-HO-0926-07": pack, issue date and version. */
export function contractNumber(c: ContractBody): string {
  const pack = Object.keys(c.proof.packs)[0] ?? "";
  const d = new Date(c.issuedAt);
  const mmdd = `${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
  return `CT-${PACK_CODE[pack] ?? "XX"}-${mmdd}-${String(c.version).padStart(2, "0")}`;
}

export function buildContractView(input: {
  planId: string;
  title: string;
  contract: ContractBody;
  report: ProofReport;
  hash: string;
  packs: readonly Pack[];
  signedAt: string | null;
}): ContractView {
  const { contract: c, report, packs } = input;
  const money = (m: number) => formatMoneyText(m, c.economics.currency);
  const e = c.economics;
  const total = e.merchandiseMinor + e.shippingMinor + e.taxEstimateMinor;
  const waived = new Set(c.waivers.map((w) => w.requirementId));
  const gate = signGate(report, c.waivers);
  const rules: ContractRuleView[] = c.requirements
    .filter((r) => effectiveImportance(r) === "hard")
    .map((r) => {
      const results = report.results.filter((x) => x.requirementId === r.id);
      const fail = results.some((x) => x.verdict === "fail");
      const unknown = results.find((x) => x.verdict === "unknown");
      return {
        id: r.id,
        text: ruleText(r, packs),
        status: fail ? "fail" : unknown ? "cant" : "pass",
        waived: !fail && !!unknown && waived.has(r.id),
        waivable: !fail && !!unknown,
        reason: unknown?.reason ? reasonLabel(unknown.reason) : null,
      };
    });
  const trigger = c.mandate?.trigger;
  const item =
    trigger && "sku" in trigger
      ? c.items.find((i) => i.sku === trigger.sku)
      : undefined;
  const shortTitle = (t: string) => t.replace(/\s+\d+".*$/, "");
  const mandate = c.mandate
    ? {
        text:
          trigger?.type === "price_lte"
            ? `Execute when the ${item ? shortTitle(item.title) : trigger.sku} is ≤ ${money(trigger.amountMinor)}, before ${formatDate(c.mandate.notAfter)}.`
            : trigger?.type === "back_in_stock"
              ? `Execute when ${item ? shortTitle(item.title) : trigger.sku} is back in stock, before ${formatDate(c.mandate.notAfter)}.`
              : `Execute every ${trigger?.type === "recurring" ? trigger.every : ""}, until ${formatDate(c.mandate.notAfter)}.`,
        trigger:
          trigger?.type === "price_lte"
            ? `${item ? shortTitle(item.title) : trigger.sku} ≤ ${money(trigger.amountMinor)}`
            : (trigger?.type ?? ""),
        notAfter: formatDate(c.mandate.notAfter),
      }
    : null;
  return {
    planId: input.planId,
    title: input.title,
    version: c.version,
    number: contractNumber(c),
    hash: input.hash,
    parentHash: c.parentHash,
    signedAt: input.signedAt,
    intent: c.intent.text,
    merchant: c.merchants.map((m) => MERCHANT[m.id] ?? m.id).join(", "),
    items: c.items.map((i) => ({
      role: i.role,
      title: i.title,
      sku: i.sku,
      seller: i.sellerId,
      qty: i.qty,
      unit: money(i.unitPriceMinor),
    })),
    rules,
    preferences: c.requirements
      .filter((r) => effectiveImportance(r) === "preference")
      .map((r) => ruleText(r, packs)),
    economics: {
      merchandise: money(e.merchandiseMinor),
      shipping: money(e.shippingMinor),
      tax: money(e.taxEstimateMinor),
      total: money(total),
      max: money(e.maxTotalMinor),
      totalMinor: total,
      maxMinor: e.maxTotalMinor,
    },
    autonomy: c.autonomy.preset,
    mandate,
    issued: formatStamp(c.issuedAt),
    expires: formatStamp(c.expiresAt),
    canSign: gate.ok,
    blockers: gate.blockers.map((b) => {
      const r = c.requirements.find((x) => x.id === b.requirementId);
      const text = r ? ruleText(r, packs) : b.requirementId;
      return b.waivable
        ? `${text}: can't check. Waive it to sign.`
        : `${text}: fails. Edit the plan or the rule.`;
    }),
  };
}

/**
 * The v{n} → v{n+1} change as diff lines (Revised contract design):
 * items keyed by role, then delivered and maximum totals.
 */
export function contractDiffLines(
  before: ContractBody,
  after: ContractBody,
  packs: readonly Pack[],
  notes: Record<string, string> = {},
): DiffLine[] {
  const money = (m: number) => formatMoneyText(m, after.economics.currency);
  const label = (role: string) => {
    for (const p of packs) {
      const r = p.roles.find((x) => x.role === role);
      if (r) return r.label;
    }
    return role;
  };
  const lines: DiffLine[] = [];
  const roles = [
    ...new Set([...before.items, ...after.items].map((i) => i.role)),
  ];
  for (const role of roles) {
    const a = before.items.find((i) => i.role === role);
    const b = after.items.find((i) => i.role === role);
    const same =
      a &&
      b &&
      a.sku === b.sku &&
      a.unitPriceMinor === b.unitPriceMinor &&
      a.qty === b.qty;
    if (same) {
      lines.push({
        kind: "ctx",
        label: label(role),
        text: b.title,
        amount: money(b.unitPriceMinor * b.qty),
      });
      continue;
    }
    if (a)
      lines.push({
        kind: "del",
        label: label(role),
        text: notes[a.sku] ? `${a.title} · ${notes[a.sku]}` : a.title,
        amount: money(a.unitPriceMinor * a.qty),
      });
    if (b)
      lines.push({
        kind: "add",
        label: label(role),
        text: notes[b.sku] ? `${b.title} · ${notes[b.sku]}` : b.title,
        amount: money(b.unitPriceMinor * b.qty),
      });
  }
  const total = (c: ContractBody) =>
    c.economics.merchandiseMinor +
    c.economics.shippingMinor +
    c.economics.taxEstimateMinor;
  lines.push({ kind: "gap" });
  if (total(before) !== total(after)) {
    lines.push({
      kind: "del",
      label: "Delivered total",
      text: "",
      amount: money(total(before)),
    });
    lines.push({
      kind: "add",
      label: "Delivered total",
      text: "",
      amount: money(total(after)),
    });
  }
  if (before.economics.maxTotalMinor !== after.economics.maxTotalMinor) {
    lines.push({
      kind: "del",
      label: "Maximum total",
      text: "",
      amount: money(before.economics.maxTotalMinor),
    });
    lines.push({
      kind: "add",
      label: "Maximum total",
      text: "",
      amount: money(after.economics.maxTotalMinor),
    });
  }
  return lines;
}

/** A fact value for display, e.g. "up to 90 W". */
export function factText(
  field: string,
  value: Parameters<typeof formatValue>[0],
  packs: readonly Pack[],
): string {
  return formatValue(value, fieldDef(field, packs));
}

/** The Sign button's gate in the page: the engine's gate, plus every waiver ticked. */
export function signReady(
  view: Pick<ContractView, "rules">,
  ticked: ReadonlySet<string>,
): { ready: boolean; reasons: string[] } {
  const reasons: string[] = [];
  for (const r of view.rules) {
    if (r.status === "fail") reasons.push(`${r.text} fails.`);
    else if (r.status === "cant" && !ticked.has(r.id))
      reasons.push(`Tick “I accept this” for ${r.text}.`);
  }
  return { ready: reasons.length === 0, reasons };
}
