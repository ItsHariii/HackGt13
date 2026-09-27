import "server-only";
import {
  type ClassifiedChange,
  type ContractBody,
  classificationLabel,
  contractHash,
  effectiveImportance,
  type Requirement,
} from "@cartel/contracts";
import { FLAGSHIP_V8_SIGNATURE } from "@cartel/contracts/fixtures";
import {
  type ApprovedState,
  type CheckoutState,
  type ConsentResult,
  consentDiff,
  fieldDef,
  formatDate,
  formatMoneyText,
  formatValue,
} from "@cartel/proof-engine";
import {
  FLAGSHIP_PACKS,
  FLAGSHIP_T_TRAP,
  FLAGSHIP_T_WEBCAM,
  flagshipStates,
  flagshipV7,
  flagshipV8,
} from "@cartel/rule-packs/fixtures";
import { FLAGSHIP_PROBLEM } from "@cartel/solver/fixtures";
import { cache } from "react";
import type { EvidenceLevel } from "@/components/cartel/evidence-badge";
import type { GuardStep } from "@/components/cartel/guard-stepper";
import type { Layer } from "@/components/cartel/layers-table";
import type { LedgerActor } from "@/components/cartel/ledger-timeline";
import { buildCompare, type CompareOptions } from "./compare";
import {
  buildContractView,
  type ContractView,
  contractDiffLines,
  formatStamp,
} from "./contract-view";
import { demoProduct } from "./demo-catalog";
import { chain, type LedgerRecord } from "./ledger";
import { ruleText } from "./workspace";

/*
 * The flagship demo plan (SDD §16.1) as every Phase 11 screen needs it.
 * Contracts, reports and diffs come from the real engine over the Zod
 * fixtures: v7 signed, the webcam price drop auto-accepted, the deal trap
 * blocked, v8 signed and paid. Timestamps that the fixtures don't pin
 * (plan creation, payment) are marked as demo values where they appear.
 */

export const FLAGSHIP = "flagship";
export const FLAGSHIP_TITLE = "Home office";
export const TRAP_DIFF = "deal-trap";
export const FLAGSHIP_ORDER = "CT-0926-0001";

/** Demo-only times the fixtures don't pin; every other time comes from them. */
const DEMO_T = {
  created: "2026-09-26T13:58:40Z",
  extracted: "2026-09-26T13:58:47Z",
  confirmed: "2026-09-26T14:00:05Z",
  solved: "2026-09-26T14:01:30Z",
  paid: "2026-09-26T14:12:55Z",
} as const;

const MONEY = (m: number) => formatMoneyText(m, "USD");

export type FlagshipStory = {
  v7: ApprovedState;
  v8: ApprovedState;
  v7Hash: string;
  v8Hash: string;
  webcam: ConsentResult;
  trap: ConsentResult;
  trapState: CheckoutState;
  /** v8 re-checked against the unchanged checkout at payment time. */
  v8Recheck: ConsentResult;
};

export const flagshipStory = cache(async (): Promise<FlagshipStory> => {
  const [v7, v8] = await Promise.all([flagshipV7(), flagshipV8()]);
  const trapState = flagshipStates.dealTrap();
  const [v7Hash, v8Hash, webcam, trap] = await Promise.all([
    contractHash(v7.contract),
    contractHash(v8.contract),
    consentDiff(
      v7,
      flagshipStates.webcamDrop(),
      FLAGSHIP_PACKS,
      FLAGSHIP_T_WEBCAM,
    ),
    consentDiff(v7, trapState, FLAGSHIP_PACKS, FLAGSHIP_T_TRAP),
  ]);
  const v8Recheck = await consentDiff(
    v8,
    flagshipStates.v8(),
    FLAGSHIP_PACKS,
    DEMO_T.paid,
  );
  return { v7, v8, v7Hash, v8Hash, webcam, trap, trapState, v8Recheck };
});

export const isFlagship = (planId: string) => planId === FLAGSHIP;

/** Contract v7 (signed, mandate armed) or v8 (the revision after the trap). */
export async function flagshipContract(version: 7 | 8): Promise<ContractView> {
  const s = await flagshipStory();
  const approved = version === 7 ? s.v7 : s.v8;
  return buildContractView({
    planId: FLAGSHIP,
    title: `${FLAGSHIP_TITLE} · Plan A`,
    contract: approved.contract,
    report: approved.report,
    hash: version === 7 ? s.v7Hash : s.v8Hash,
    packs: FLAGSHIP_PACKS,
    signedAt: version === 7 ? approved.contract.issuedAt : null,
  });
}

/** The v7 → v8 change, with the reason each swapped item changed. */
export async function flagshipRevision() {
  const s = await flagshipStory();
  const monitorBefore = s.v7.contract.items.find((i) => i.role === "monitor");
  const pd = (state: CheckoutState, productSku: string | undefined) => {
    const offer = state.offers.find((o) => o.sku === productSku);
    const fact = state.facts.find(
      (f) =>
        f.subjectId === offer?.productId &&
        f.field === "monitor.usb_c_pd_watts",
    );
    return fact
      ? formatValue(fact.value, fieldDef(fact.field, FLAGSHIP_PACKS))
      : null;
  };
  const monitorAfter = s.v8.contract.items.find((i) => i.role === "monitor");
  const was = pd(s.v7.snapshot, monitorBefore?.sku);
  const now = pd(s.trapState, monitorBefore?.sku);
  const next = pd(s.v8.snapshot, monitorAfter?.sku);
  const notes: Record<string, string> = {};
  if (monitorBefore && was && now)
    notes[monitorBefore.sku] = `USB-C ${was} → listing changed to ${now}`;
  if (monitorAfter && next) notes[monitorAfter.sku] = `USB-C ${next}`;
  return {
    lines: contractDiffLines(
      s.v7.contract,
      s.v8.contract,
      FLAGSHIP_PACKS,
      notes,
    ),
    fromHash: s.v7Hash,
    toHash: s.v8Hash,
    reason: monitorBefore
      ? `v7 paused because the ${monitorBefore.title.replace(/\s+\d+".*$/, "")} listing changed. This version replaces the monitor. Everything else in v7 stays the same.`
      : "",
  };
}

export type PausedView = {
  planId: string;
  diffId: string;
  version: number;
  contractHash: string;
  when: string;
  trigger: string | null;
  lead: string;
  checkoutTotal: string;
  layers: Layer[];
  changed: {
    heading: string;
    rows: {
      label: string;
      approved: string;
      current: string;
      /** The failing value, circled in red pen. */
      failing?: boolean;
    }[];
  } | null;
  failingRule: string;
  summary: string;
  announcement: string;
  alternative: {
    title: string;
    /** The replacement's photo; the page shows a placeholder without one. */
    imageUrl: string | null;
    spec: string;
    evidence: EvidenceLevel;
    price: string;
    hardPass: number;
    hardTotal: number;
    waived: number;
  };
};

function roleOf(req: Requirement | undefined) {
  return req?.role ?? null;
}

/** The Purchase Paused screen for the deal trap (TASKS T11.8). */
export async function flagshipPaused(): Promise<PausedView> {
  const s = await flagshipStory();
  const { contract } = s.v7;
  const { diff, reproof } = s.trap;
  const block = diff.changes.filter((c) => c.class === "block");
  const verdictBlock = block.find(
    (c): c is Extract<ClassifiedChange, { kind: "verdict" }> =>
      c.kind === "verdict",
  );
  const req = contract.requirements.find(
    (r) => r.id === verdictBlock?.requirementId,
  );
  const role = roleOf(req);
  const def = req ? fieldDef(req.field, FLAGSHIP_PACKS) : undefined;
  const approvedItem = contract.items.find((i) => i.role === role);
  const liveLine = s.trapState.basket.lines.find((l) => l.role === role);
  const liveOffer = s.trapState.offers.find((o) => o.id === liveLine?.offerId);
  const factChange = diff.changes.find(
    (c): c is Extract<ClassifiedChange, { kind: "fact" }> =>
      c.kind === "fact" && c.field === req?.field,
  );
  const priceChange = diff.changes.find(
    (c): c is Extract<ClassifiedChange, { kind: "economics" }> =>
      c.kind === "economics" && c.attribute === "unit_price" && c.role === role,
  );
  const identity = diff.changes.filter((c) => c.kind === "identity");
  const merchantChanged = identity.some(
    (c) => c.kind === "identity" && c.attribute === "merchant",
  );
  const withinMax = diff.currentTotalMinor <= contract.economics.maxTotalMinor;
  const target = req ? formatValue(req.target, def) : "";
  const before = factChange ? formatValue(factChange.before, def) : "";
  const after = factChange ? formatValue(factChange.after, def) : "";
  const label = def?.label ?? req?.field ?? "";
  const failDetail = req
    ? `${label} ${after} < ${target} required`
    : "A hard rule fails";
  const short = (t: string) => t.replace(/\s+\d+".*$/, "");
  const trigger = contract.mandate?.trigger;
  const triggerText =
    trigger?.type === "price_lte"
      ? `Mandate: ${trigger.sku} ≤ ${MONEY(trigger.amountMinor)}`
      : null;

  const v8 = s.v8;
  const altItem = v8.contract.items.find((i) => i.role === role);
  const altOffer = v8.snapshot.offers.find((o) => o.sku === altItem?.sku);
  const altFact = v8.snapshot.facts.find(
    (f) => f.subjectId === altOffer?.productId && f.field === req?.field,
  );
  const authority = altFact
    ? v8.snapshot.sources?.[altFact.sourceId]?.authority
    : undefined;
  const hard = v8.report.summary.hard;

  return {
    planId: FLAGSHIP,
    diffId: TRAP_DIFF,
    version: contract.version,
    contractHash: s.v7Hash,
    when: formatStamp(diff.evaluatedAt),
    trigger: triggerText,
    lead:
      approvedItem && priceChange
        ? `The ${short(approvedItem.title)} dropped to ${MONEY(priceChange.afterMinor)} and fired your standing mandate. Before paying, Cartel re-checked the live checkout against contract v${contract.version}. ${block.length === 1 ? "One rule failed." : `${block.length} changes block it.`}`
        : `Before paying, Cartel re-checked the live checkout against contract v${contract.version}. A hard rule failed.`,
    checkoutTotal: MONEY(diff.currentTotalMinor),
    layers: [
      {
        name: "Cart hash (SKU, qty, seller)",
        status: identity.length === 0 ? "pass" : "fail",
        detail:
          identity.length === 0
            ? `unchanged${approvedItem ? ` SKU ${approvedItem.sku}` : ""}`
            : `${identity.length} identity change(s)`,
      },
      {
        name: "Merchant",
        status: merchantChanged ? "fail" : "pass",
        detail: "GreatHub",
      },
      {
        name: "Amount within max",
        status: withinMax ? "pass" : "fail",
        detail: `${MONEY(diff.currentTotalMinor)} ${withinMax ? "≤" : ">"} ${MONEY(contract.economics.maxTotalMinor)}`,
      },
      {
        name: "Cartel re-check",
        status: reproof.summary.hard.fail > 0 ? "fail" : "pass",
        detail: failDetail,
      },
    ],
    changed:
      approvedItem && liveOffer && req
        ? {
            heading: `${capitalize(role ?? "")} · ${approvedItem.sku === liveOffer.sku ? "same listing" : "different listing"}`,
            rows: [
              {
                label: "Model",
                approved: short(approvedItem.title),
                current: `${short(liveOffer.title)}${approvedItem.sku === liveOffer.sku ? " (same SKU)" : ""}`,
              },
              {
                label: "Price",
                approved: MONEY(approvedItem.unitPriceMinor),
                current: MONEY(liveOffer.price.amountMinor),
              },
              ...(factChange
                ? [{ label, approved: before, current: after, failing: true }]
                : []),
              {
                label: "Your rule",
                approved: ruleText(req, FLAGSHIP_PACKS),
                current: ruleText(req, FLAGSHIP_PACKS),
              },
              { label: "Result", approved: "Pass", current: "Fail" },
            ],
          }
        : null,
    failingRule: req ? ruleText(req, FLAGSHIP_PACKS) : "",
    summary:
      approvedItem && priceChange && factChange
        ? `The ${role} got ${MONEY(priceChange.beforeMinor - priceChange.afterMinor)} cheaper, but the listing now says ${after} for ${label}, below the ${target} you required. Cartel stopped before paying.`
        : "A hard rule no longer passes against the live checkout, so Cartel stopped before paying.",
    announcement: `Purchase paused. No payment was made. ${label} ${after} is below ${target}.`,
    alternative: {
      title: altItem?.title ?? "",
      imageUrl: altOffer
        ? (demoProduct(altOffer.productId)?.imageUrl ?? null)
        : null,
      spec: altFact
        ? `${label} ${formatValue(altFact.value, def)}`
        : (altItem?.sku ?? ""),
      evidence: authority === "manufacturer" ? "manufacturer" : "seller",
      price: altItem ? MONEY(altItem.unitPriceMinor) : "",
      hardPass: hard.pass,
      hardTotal: hard.pass + hard.fail + hard.unknown,
      waived: v8.contract.waivers.length,
    },
  };
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export type GuardRun = {
  title: string;
  when: string;
  steps: GuardStep[];
  outcome: "paused" | "paid";
  href: string;
};

/** Both guarded checkouts of the flagship plan, newest first (TASKS T11.7). */
export async function flagshipGuardRuns(): Promise<GuardRun[]> {
  const s = await flagshipStory();
  const trap = await flagshipGuardRun();
  const e = s.v8.contract.economics;
  const total = e.merchandiseMinor + e.shippingMinor + e.taxEstimateMinor;
  const recheck = s.v8Recheck;
  const hard = recheck.reproof.summary.hard;
  return [
    {
      title: `Contract v${s.v8.contract.version} · you started checkout`,
      when: formatStamp(DEMO_T.paid),
      outcome: "paid",
      href: `/orders/${FLAGSHIP_ORDER}`,
      steps: [
        {
          label: "Refresh cart",
          state: "done",
          meta: `GreatHub checkout · ${MONEY(total)}`,
        },
        {
          label: "Re-fetch specs",
          state: "done",
          meta: `${s.v8.snapshot.facts.filter((f) => f.subjectKind === "product").length} product facts`,
        },
        {
          label: "Re-prove",
          state: "done",
          meta: `${hard.pass} hard rules pass · ${hard.unknown} waived`,
        },
        {
          label: "Diff",
          state: "done",
          meta: classificationLabel(recheck.diff.classification),
        },
        {
          label: "Guard",
          state: "done",
          meta: `${MONEY(total)} ≤ ${MONEY(e.maxTotalMinor)}`,
        },
        { label: "Pay", state: "done", meta: "Authorized · sandbox" },
        { label: "Order", state: "done", meta: FLAGSHIP_ORDER },
      ],
    },
    {
      title: `Contract v${s.v7.contract.version} · standing mandate fired`,
      when: formatStamp(s.trap.diff.evaluatedAt),
      outcome: "paused",
      href: `/plans/${FLAGSHIP}/diff/${TRAP_DIFF}`,
      steps: trap.steps,
    },
  ];
}

/** The checkout guard's run for the deal trap, step by step (TASKS T11.7). */
export async function flagshipGuardRun(): Promise<{
  steps: GuardStep[];
  outcome: "paused";
  diffId: string;
}> {
  const s = await flagshipStory();
  const { diff, reproof } = s.trap;
  const at = formatStamp(diff.evaluatedAt);
  const hard = reproof.summary.hard;
  return {
    outcome: "paused",
    diffId: TRAP_DIFF,
    steps: [
      {
        label: "Refresh cart",
        state: "done",
        meta: `GreatHub checkout · ${MONEY(diff.currentTotalMinor)}`,
      },
      {
        label: "Re-fetch specs",
        state: "done",
        meta: `${s.trapState.facts.filter((f) => f.subjectKind === "product").length} product facts · ${at}`,
      },
      {
        label: "Re-prove",
        state: "done",
        meta: `${hard.fail} hard rule${hard.fail === 1 ? "" : "s"} fail${hard.fail === 1 ? "s" : ""}`,
      },
      {
        label: "Diff",
        state: "done",
        meta: `${diff.changes.length} changes vs v${s.v7.contract.version}`,
      },
      { label: "Guard", state: "failed", meta: "Blocked · no payment" },
      { label: "Pay", state: "pending", meta: "Not attempted" },
      { label: "Order", state: "pending", meta: "Not created" },
    ],
  };
}

export type OrderView = {
  id: string;
  planId: string;
  title: string;
  merchant: string;
  when: string;
  lines: { label: string; amount: string }[];
  shipping: string;
  tax: string;
  total: string;
  processor: string;
  status: string;
  contractVersion: number;
  contractHash: string;
  proof: string;
  signed: string;
  returnPolicy: string;
  steps: GuardStep[];
};

/** The paid order for contract v8 (TASKS T11.9). Payment time is a demo value. */
export async function flagshipOrder(): Promise<OrderView> {
  const s = await flagshipStory();
  const c = s.v8.contract;
  const e = c.economics;
  const hard = s.v8.report.summary.hard;
  const terms = c.items[0]?.terms;
  return {
    id: FLAGSHIP_ORDER,
    planId: FLAGSHIP,
    title: FLAGSHIP_TITLE,
    merchant: "GreatHub (test merchant)",
    when: formatStamp(DEMO_T.paid),
    lines: c.items.map((i) => ({
      label: i.title,
      amount: MONEY(i.unitPriceMinor * i.qty),
    })),
    shipping: MONEY(e.shippingMinor),
    tax: MONEY(e.taxEstimateMinor),
    total: MONEY(e.merchandiseMinor + e.shippingMinor + e.taxEstimateMinor),
    processor: "Visa Acceptance sandbox",
    status: "AUTHORIZED",
    contractVersion: c.version,
    contractHash: s.v8Hash,
    proof: `${hard.pass} of ${hard.pass + hard.unknown + hard.fail} hard rules passed${hard.unknown ? ` · ${hard.unknown} can't check (waived)` : ""}`,
    signed: formatStamp(FLAGSHIP_V8_SIGNATURE.signedAt),
    returnPolicy: terms
      ? terms.finalSale
        ? "Final sale"
        : `${terms.returnWindowDays}-day returns · ${terms.returnFeeMinor ? MONEY(terms.returnFeeMinor) : "free"}`
      : "—",
    steps: [
      {
        label: "Re-checked",
        state: "done",
        meta: `${hard.pass} hard rules pass`,
      },
      { label: "Paid", state: "done", meta: formatStamp(DEMO_T.paid) },
      { label: "Confirmed", state: "current", meta: "Pending · merchant" },
      { label: "Shipped", state: "pending", meta: "Pending" },
    ],
  };
}

export type LedgerRow = LedgerRecord & {
  display: LedgerActor;
  time: string;
  description: string;
  blocked: boolean;
};

/** Maps a stored actor to its badge: YOU, SYS, AI or MER. */
export function ledgerActor(actor: string): LedgerActor {
  if (actor.startsWith("user")) return "you";
  if (actor.startsWith("merchant")) return "mer";
  if (actor === "worker:ai") return "ai";
  return "sys";
}

/** "14:02:30" from a stored timestamp (UTC). */
export function ledgerTime(iso: string): string {
  return iso.slice(11, 19);
}

/** The flagship plan's ledger, hash-chained exactly as the database would. */
export const flagshipLedger = cache(async (): Promise<LedgerRow[]> => {
  const s = await flagshipStory();
  const us = (iso: string) => iso.replace(/Z$/, ".000000Z");
  const v7 = s.v7.contract;
  const v8 = s.v8.contract;
  const total = (c: ContractBody) =>
    c.economics.merchandiseMinor +
    c.economics.shippingMinor +
    c.economics.taxEstimateMinor;
  const req = v7.requirements;
  const kinds = (k: Requirement["provenance"]["kind"]) =>
    req.filter((r) => r.provenance.kind === k).length;
  const webcamChange = s.webcam.diff.changes.find(
    (c) => c.kind === "economics" && c.attribute === "unit_price",
  );
  const trig = v7.mandate?.trigger;
  const monitorPrice = s.trap.diff.changes.find(
    (c) =>
      c.kind === "economics" &&
      c.attribute === "unit_price" &&
      c.role === "monitor",
  );
  const hard7 = s.v7.report.summary.hard;
  const user = "user:5f0c7a52-3b8e-4d61-9a2f-1c6e8b4d7a90";
  const events: {
    actor: string;
    type: string;
    createdAt: string;
    payload: Record<string, unknown>;
    description: string;
    blocked?: boolean;
  }[] = [
    {
      actor: user,
      type: "plan.created",
      createdAt: DEMO_T.created,
      payload: { title: FLAGSHIP_TITLE },
      description: "Home office plan started from your brief.",
    },
    {
      actor: "worker:ai",
      type: "requirements.extracted",
      createdAt: DEMO_T.extracted,
      payload: { rules: req.length },
      description: `${req.length} rules drafted: ${kinds("user_stated")} you said, ${kinds("ai_inferred")} assumed, ${kinds("pack_default")} default.`,
    },
    {
      actor: user,
      type: "requirement.confirmed",
      createdAt: DEMO_T.confirmed,
      payload: { requirement: "r_usb_pd" },
      description: `${ruleText(req.find((r) => r.id === "r_usb_pd") as Requirement, FLAGSHIP_PACKS)} confirmed.`,
    },
    {
      actor: "system",
      type: "basket.solved",
      createdAt: DEMO_T.solved,
      payload: { items: v7.items.length, total_minor: total(v7) },
      description: `Plan A · Balanced: ${v7.items.length} items, ${MONEY(total(v7))}.`,
    },
    {
      actor: "system",
      type: "proof.completed",
      createdAt: s.v7.report.evaluatedAt,
      payload: { report: s.v7.report.hash },
      description: `${hard7.pass} of ${hard7.pass + hard7.unknown + hard7.fail} hard rules pass · ${hard7.unknown} can't check.`,
    },
    {
      actor: user,
      type: "contract.signed",
      createdAt: v7.issuedAt,
      payload: { version: 7, hash: s.v7Hash },
      description: `v7 · Signed with passkey · max ${MONEY(v7.economics.maxTotalMinor)}.`,
    },
    {
      actor: "system",
      type: "mandate.armed",
      createdAt: v7.issuedAt,
      payload: { version: 7 },
      description:
        trig?.type === "price_lte"
          ? `Waiting for ${trig.sku} ≤ ${MONEY(trig.amountMinor)}.`
          : "Mandate armed.",
    },
    {
      actor: "system",
      type: "change.auto_accepted",
      createdAt: FLAGSHIP_T_WEBCAM,
      payload: { classification: s.webcam.diff.classification },
      description:
        webcamChange?.kind === "economics"
          ? `Webcam ${MONEY(webcamChange.beforeMinor)} → ${MONEY(webcamChange.afterMinor)}. Allowed under Balanced. New total ${MONEY(s.webcam.diff.currentTotalMinor)}.`
          : "A change was accepted under your autonomy setting.",
    },
    {
      actor: "worker:mandates",
      type: "mandate.fired",
      createdAt: FLAGSHIP_T_TRAP,
      payload: { version: 7 },
      description:
        monitorPrice?.kind === "economics" && trig?.type === "price_lte"
          ? `${trig.sku} dropped to ${MONEY(monitorPrice.afterMinor)} (≤ ${MONEY(trig.amountMinor)}).`
          : "Mandate fired.",
    },
    {
      actor: "system",
      type: "diff.detected",
      createdAt: FLAGSHIP_T_TRAP,
      payload: { classification: s.trap.diff.classification },
      description: `${s.trap.diff.changes.length} changes since v7 · classification: ${s.trap.diff.classification}.`,
    },
    {
      actor: "system",
      type: "execution.blocked",
      createdAt: FLAGSHIP_T_TRAP,
      payload: { total_minor: s.trap.diff.currentTotalMinor },
      description: `Same SKU: USB-C power 90 W → 15 W. Rule ≥ 65 W fails. Would have charged ${MONEY(s.trap.diff.currentTotalMinor)}.`,
      blocked: true,
    },
    {
      actor: user,
      type: "contract.signed",
      createdAt: FLAGSHIP_V8_SIGNATURE.signedAt,
      payload: { version: 8, hash: s.v8Hash },
      description: `v8 · Halden M27Q-USBC replaces U2727 · max ${MONEY(v8.economics.maxTotalMinor)}.`,
    },
    {
      actor: "merchant:greathub",
      type: "payment.authorized",
      createdAt: DEMO_T.paid,
      payload: { total_minor: total(v8) },
      description: `Visa Acceptance sandbox · ${MONEY(total(v8))} · AUTHORIZED.`,
    },
  ];
  const records = await chain(
    FLAGSHIP,
    events.map((e) => ({ ...e, createdAt: us(e.createdAt) })),
  );
  return records.map((r, i) => ({
    ...r,
    display: ledgerActor(r.actor),
    time: ledgerTime(r.createdAt),
    description: events[i]?.description ?? "",
    blocked: events[i]?.blocked ?? false,
  }));
});

export type MandateView = {
  id: string;
  planId: string;
  planTitle: string;
  version: number;
  trigger: string;
  notAfter: string;
  status:
    | "armed"
    | "fired_executed"
    | "fired_blocked"
    | "expired"
    | "cancelled";
  detail: string;
  nextCheck: string | null;
  href: string;
};

/** The v7 mandate: it fired on the price drop and the guard blocked it. */
export async function flagshipMandates(): Promise<MandateView[]> {
  const s = await flagshipStory();
  const c = s.v7.contract;
  const trig = c.mandate?.trigger;
  if (!c.mandate || !trig) return [];
  return [
    {
      id: "m_flagship_v7",
      planId: FLAGSHIP,
      planTitle: FLAGSHIP_TITLE,
      version: c.version,
      trigger:
        trig.type === "price_lte"
          ? `${trig.sku} ≤ ${MONEY(trig.amountMinor)}`
          : trig.type,
      notAfter: formatDate(c.mandate.notAfter),
      status: "fired_blocked",
      detail: `Fired ${formatStamp(FLAGSHIP_T_TRAP)}. The guard blocked payment: a hard rule failed.`,
      nextCheck: null,
      href: `/plans/${FLAGSHIP}/diff/${TRAP_DIFF}`,
    },
  ];
}

/** Plans A–C from the solver over the flagship catalog (TASKS T11.5). */
export async function flagshipCompare(options: CompareOptions = {}) {
  const s = await flagshipStory();
  const titles = Object.fromEntries(
    [
      ...s.v7.snapshot.offers,
      ...s.v8.snapshot.offers,
      ...s.trapState.offers,
    ].map((o) => [o.productId, o.title]),
  );
  // Candidates that exist only in the solver's catalog fixture.
  Object.assign(titles, {
    dm_atlas_standing_48: 'Atlas Standing Desk 48"',
    dm_marlow_task: "Marlow Task Chair",
    dm_volt_240w_2m: "Volt USB-C Cable 240 W, 2 m",
  });
  const roleLabels = Object.fromEntries(
    FLAGSHIP_PACKS.flatMap((p) => p.roles.map((r) => [r.role, r.label])),
  );
  const reqs = s.v7.contract.requirements;
  return buildCompare(
    FLAGSHIP_PROBLEM,
    {
      titles,
      roleLabels,
      itemRules: reqs
        .filter(
          (r) =>
            r.scope === "item" &&
            effectiveImportance(r) === "hard" &&
            !s.v7.contract.waivers.some((w) => w.requirementId === r.id),
        )
        .map((r) => ({ id: r.id, text: ruleText(r, FLAGSHIP_PACKS) })),
      preferences: Object.fromEntries(
        Object.keys(FLAGSHIP_PROBLEM.preferenceWeights ?? {}).map((id) => {
          const r = reqs.find((x) => x.id === id);
          return [
            id,
            r
              ? ruleText(r, FLAGSHIP_PACKS)
              : id === "p_standing_desk"
                ? "Standing desk"
                : id,
          ];
        }),
      ),
    },
    options,
  );
}
