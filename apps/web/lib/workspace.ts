import {
  effectiveImportance,
  evidenceLabel,
  type Fact,
  formatAge,
  type Offer,
  type Operator,
  type ProofReport,
  type ProofResult,
  type Requirement,
  type Value,
  type Waiver,
} from "@cartel/contracts";
import {
  type CheckoutState,
  type FieldDef,
  fieldDef,
  formatMoneyText,
  formatTarget,
  formatValue,
  type Pack,
  signGate,
  sumMoney,
  timesQty,
} from "@cartel/proof-engine";

/*
 * The workspace screen as plain data (TASKS T11.3, T11.4). Everything the
 * page shows comes from the engine's report and the checkout it proved;
 * nothing here decides a verdict. Wording follows SDD §17.3 through the
 * shared copy helpers in @cartel/contracts.
 */

export type RequirementKind =
  | "said"
  | "chose"
  | "confirmed"
  | "default"
  | "assumed"
  | "cant";

export type RequirementView = {
  id: string;
  text: string;
  strength: "HARD" | "PREF" | "—";
  kind: RequirementKind;
};

export type ItemView = {
  role: string;
  title: string;
  spec: string;
  merchant: string;
  price: string;
};

export type Tier = Offer["tier"];

export type PlanView = {
  id: string;
  label: string;
  items: ItemView[];
  merchandise: string;
  shipping: string;
  tax: string;
  total: string;
  tier: Tier | "mixed";
  tierLabel: string;
};

export type RowKind = "pass" | "fail" | "est" | "cant";
export type Tick = "pass" | "fail" | "waived" | "open";

export type ProofRowView = {
  id: string;
  requirementId: string;
  rule: string;
  kind: RowKind;
  status: string;
  value: string;
  evidence: string;
  /** Solid ink for attributed facts, dashed pencil for estimates and unknowns. */
  evidenceTone: "ink" | "pencil";
  hard: boolean;
};

export type ProofView = {
  headline: string;
  sub: string;
  ticks: Tick[];
  rows: ProofRowView[];
};

export type EvidenceView = {
  row: ProofRowView;
  verdict: string;
  comparison: string;
  subject: string | null;
  sourceText: string | null;
  claimedBy: string;
  source: string;
  retrieved: string;
  extractor: string;
  extracted: string;
  sourceId: string | null;
  url: string | null;
};

export type WorkspaceView = {
  planId: string;
  title: string;
  path: string;
  requirements: RequirementView[];
  plans: PlanView[];
  proof: ProofView;
  canReviewContract: boolean;
  ctaNote: string;
  evidence: Record<string, EvidenceView>;
  /** Saved plans with Plans A–C: where each tab leads, and which is open. */
  planHrefs?: string[];
  activePlan?: number;
  /** Where "Review contract" leads; defaults to the plan's contract page. */
  contractHref?: string;
};

export type WorkspaceInput = {
  planId: string;
  title: string;
  path: string;
  planLabel: string;
  requirements: readonly Requirement[];
  checkout: CheckoutState;
  report: ProofReport;
  packs: readonly Pack[];
  waivers: readonly Waiver[];
};

const OP_SYMBOL: Partial<Record<Operator, string>> = {
  lte: "≤",
  gte: "≥",
  neq: "≠",
  before: "before",
  excludes: "without",
  contains: "including",
  in: "one of",
  not_in: "none of",
  between: "between",
};

const TIER_LABEL: Record<Tier, string> = {
  full: "Full Cartel checkout",
  handoff: "Hand off to store",
  proof_only: "Proof only",
};

const MERCHANT_LABEL: Record<string, string> = {
  greathub: "GreatHub (test merchant)",
};

const AUTHORITY_LABEL: Record<string, string> = {
  merchant_checkout: "Merchant checkout",
  merchant: "Merchant",
  manufacturer: "Manufacturer",
  catalog: "Product catalog",
  government: "Government registry",
  user: "You",
  text: "Listing text",
};

const EXTRACTOR_LABEL: Record<string, string> = {
  jsonld: "JSON-LD",
  checkout: "Checkout API",
  icecat: "Icecat",
};

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "4k" reads as "4K"; everything else is the engine's own formatting. */
function display(v: Value | null, def?: FieldDef): string {
  const text = formatValue(v, def);
  return /^\d+k$/i.test(text) ? text.toUpperCase() : text;
}

function roleLabel(role: string, packs: readonly Pack[]): string {
  for (const p of packs) {
    const r = p.roles.find((x) => x.role === role);
    if (r) return capitalize(r.label);
  }
  return capitalize(role.replace(/_/g, " "));
}

/** "Desk width ≤ 48 in", "Monitor resolution 4K", "No substitutions". */
export function ruleText(r: Requirement, packs: readonly Pack[]): string {
  const def = fieldDef(r.field, packs);
  let label = def?.label ?? r.field;
  if (r.role) {
    const role = roleLabel(r.role, packs);
    if (!label.toLowerCase().startsWith(role.toLowerCase())) {
      const lower = /^[A-Z][a-z]/.test(label)
        ? label.charAt(0).toLowerCase() + label.slice(1)
        : label;
      // "USB-C cable" + "Cable power rating" reads "USB-C cable power rating".
      const roleLast = role.toLowerCase().split(" ").pop();
      const [first, ...rest] = lower.split(" ");
      label =
        rest.length && first?.toLowerCase() === roleLast
          ? `${role} ${rest.join(" ")}`
          : `${role} ${lower}`;
    }
  }
  if (r.op === "exists") return label;
  if (r.op === "between")
    return `${label} ${formatTarget(r.op, r.target, def)}`;
  if (r.op === "eq" && typeof r.target === "boolean") {
    return r.target ? label : `No ${label.toLowerCase()}`;
  }
  // Targets are round numbers people typed: "$1,000", not "$1,000.00".
  const target = display(r.target, def).replace(/\.00$/, "");
  if (r.op === "lte" && def?.kind === "date") return `${label} by ${target}`;
  const symbol = OP_SYMBOL[r.op];
  return symbol ? `${label} ${symbol} ${target}` : `${label} ${target}`;
}

function resultKey(r: ProofResult, siblings: number): string {
  if (siblings <= 1) return r.requirementId;
  const suffix =
    r.scope.kind === "item"
      ? (r.scope.offerId ?? r.scope.role)
      : r.scope.kind === "pair"
        ? r.scope.offerIds.join("+")
        : r.scope.kind === "merchant"
          ? r.scope.merchant
          : r.scope.kind;
  return `${r.requirementId}--${suffix}`;
}

function ageSeconds(fromIso: string, toIso: string): number {
  return Math.max(0, (Date.parse(toIso) - Date.parse(fromIso)) / 1000);
}

function requirementKind(
  r: Requirement,
  waived: boolean,
  result: ProofResult | undefined,
): RequirementKind {
  if (waived && result?.verdict === "unknown") return "cant";
  switch (r.provenance.kind) {
    case "user_stated":
      return "said";
    case "user_selected":
      return "chose";
    case "pack_default":
      return "default";
    case "ai_inferred":
      return r.provenance.confirmed ? "confirmed" : "assumed";
  }
}

function tierOf(offers: readonly Offer[]): {
  tier: Tier | "mixed";
  label: string;
} {
  const tiers = new Set(offers.map((o) => o.tier));
  if (tiers.size === 1) {
    const [only] = tiers;
    if (only) return { tier: only, label: TIER_LABEL[only] };
  }
  return { tier: "mixed", label: "Mixed checkout" };
}

export function buildWorkspace(input: WorkspaceInput): WorkspaceView {
  const { checkout, report, packs, requirements, waivers } = input;
  const now = report.evaluatedAt;
  const factById = new Map(checkout.facts.map((f) => [f.id, f]));
  const offerById = new Map(checkout.offers.map((o) => [o.id, o]));
  const waived = new Set(waivers.map((w) => w.requirementId));
  const byRequirement = new Map<string, ProofResult[]>();
  for (const r of report.results) {
    const list = byRequirement.get(r.requirementId) ?? [];
    list.push(r);
    byRequirement.set(r.requirementId, list);
  }

  const sourceName = (f: Fact | undefined, scope: ProofResult["scope"]) => {
    if (f) return checkout.sources?.[f.sourceId]?.name ?? f.sourceId;
    if (scope.kind === "order") return "Your order settings";
    const merchant = checkout.quotes?.[0]?.merchant;
    return merchant
      ? `${MERCHANT_LABEL[merchant] ?? merchant} checkout`
      : "Checkout";
  };

  const rows: ProofRowView[] = [];
  const evidence: Record<string, EvidenceView> = {};
  const ordered = [...requirements].sort(
    (a, b) =>
      Number(effectiveImportance(a) !== "hard") -
      Number(effectiveImportance(b) !== "hard"),
  );
  for (const req of ordered) {
    const results = byRequirement.get(req.id) ?? [];
    const def = fieldDef(req.field, packs);
    for (const result of results) {
      const fact = result.factIds
        .map((id) => factById.get(id))
        .find((f): f is Fact => f !== undefined && f.subjectKind === "product");
      const anyFact =
        fact ?? result.factIds.map((id) => factById.get(id)).find(Boolean);
      const isWaived = waived.has(req.id) && result.verdict === "unknown";
      const kind: RowKind =
        result.verdict === "fail"
          ? "fail"
          : result.verdict === "unknown"
            ? "cant"
            : result.evidenceState === "estimated"
              ? "est"
              : "pass";
      const hard = result.importance === "hard";
      const status =
        kind === "fail"
          ? hard
            ? "Fail"
            : "Preference not met"
          : kind === "cant"
            ? `Can't check${result.reason === "subjective" ? " · subjective" : ""}`
            : kind === "est"
              ? "Pass · estimate"
              : hard
                ? "Pass"
                : "Preference met";
      const source = sourceName(anyFact, result.scope);
      const age = anyFact ? ageSeconds(anyFact.retrievedAt, now) : null;
      const row: ProofRowView = {
        id: resultKey(result, results.length),
        requirementId: req.id,
        rule: ruleText(req, packs),
        kind,
        status,
        value:
          result.verdict === "unknown"
            ? isWaived
              ? "Waived"
              : "—"
            : display(result.observed, def),
        evidence: evidenceLabel(
          result.evidenceState,
          source,
          age,
          result.reason,
        ),
        evidenceTone:
          result.evidenceState === "verified" ||
          result.evidenceState === "source_stated"
            ? "ink"
            : "pencil",
        hard,
      };
      rows.push(row);

      const offer =
        result.scope.kind === "item" && result.scope.offerId
          ? offerById.get(result.scope.offerId)
          : undefined;
      const authority = anyFact
        ? checkout.sources?.[anyFact.sourceId]?.authority
        : undefined;
      const symbol = OP_SYMBOL[result.target.op];
      evidence[row.id] = {
        row,
        verdict:
          kind === "fail" ? "Fail" : kind === "cant" ? "Can't check" : "Pass",
        comparison:
          result.verdict === "unknown"
            ? capitalize(
                `${result.reason === "subjective" ? "subjective, so it can't be checked" : "no usable value"}`,
              )
            : symbol
              ? `${display(result.observed, def)} ${symbol} ${display(result.target.value, def)}`
              : display(result.observed, def),
        subject: offer ? `${offer.title} · SKU ${offer.sku}` : null,
        sourceText: fact?.quote ?? fact?.raw ?? null,
        claimedBy: authority
          ? (AUTHORITY_LABEL[authority] ?? authority)
          : result.scope.kind === "order"
            ? "You"
            : "Merchant checkout",
        source,
        retrieved: age === null ? "At checkout" : formatAge(age),
        extractor: anyFact
          ? (EXTRACTOR_LABEL[anyFact.extractor] ?? anyFact.extractor)
          : "Checkout API",
        extracted: `${req.field} = ${
          result.observed === null ? "nothing" : display(result.observed, def)
        }`,
        sourceId: anyFact?.sourceId ?? null,
        url: offer?.url ?? null,
      };
    }
  }

  const hardRows = rows.filter((r) => r.hard);
  const ticks: Tick[] = hardRows.map((r) =>
    r.kind === "fail"
      ? "fail"
      : r.kind === "cant"
        ? r.value === "Waived"
          ? "waived"
          : "open"
        : "pass",
  );
  const pass = ticks.filter((t) => t === "pass").length;
  const fail = ticks.filter((t) => t === "fail").length;
  const waivedCount = ticks.filter((t) => t === "waived").length;
  const open = ticks.filter((t) => t === "open").length;
  const estimates = hardRows.filter((r) => r.kind === "est").length;
  const plural = (n: number, one: string, many: string) =>
    `${n} ${n === 1 ? one : many}`;
  const headline =
    fail > 0
      ? `${plural(fail, "hard rule fails", "hard rules fail")}`
      : `${pass} of ${hardRows.length} hard rules pass`;
  const sub = [
    fail > 0 ? `${pass} pass` : null,
    waivedCount > 0 ? `${waivedCount} can't check (waived)` : null,
    open > 0 ? plural(open, "can't check yet", "can't check yet") : null,
    estimates > 0 ? plural(estimates, "estimate", "estimates") : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const lines = checkout.basket.lines;
  const offers = lines
    .map((l) => offerById.get(l.offerId))
    .filter((o): o is Offer => o !== undefined);
  const items: ItemView[] = lines.flatMap((line) => {
    const offer = offerById.get(line.offerId);
    if (!offer) return [];
    const spec = checkout.facts.find(
      (f) =>
        f.subjectKind === "product" &&
        f.subjectId === offer.productId &&
        f.state !== "unknown" &&
        f.value !== null,
    );
    const specDef = spec ? fieldDef(spec.field, packs) : undefined;
    const specText = spec
      ? spec.value === true
        ? (specDef?.label ?? spec.field)
        : `${specDef?.label ?? spec.field} ${display(spec.value, specDef)}`
      : `SKU ${offer.sku}`;
    return [
      {
        role: roleLabel(line.role, packs),
        title: offer.title,
        spec: specText,
        merchant: MERCHANT_LABEL[offer.merchant] ?? offer.merchant,
        price: formatMoneyText(
          timesQty(offer.price, line.qty).amountMinor,
          offer.price.currency,
        ),
      },
    ];
  });
  const currency = offers[0]?.price.currency ?? "USD";
  const merchandise = sumMoney(
    lines.flatMap((l) => {
      const o = offerById.get(l.offerId);
      return o ? [timesQty(o.price, l.qty)] : [];
    }),
    currency,
  );
  const quote = checkout.quotes?.[0];
  const shippingMinor = quote?.shipping.amountMinor ?? 0;
  const taxMinor = quote?.tax.amountMinor ?? 0;
  const totalMinor =
    quote?.total?.amountMinor ??
    merchandise.amountMinor + shippingMinor + taxMinor;
  const { tier, label: tierLabel } = tierOf(offers);

  const gate = signGate(report, waivers);
  const requirementViews: RequirementView[] = requirements.map((r) => {
    const result = byRequirement.get(r.id)?.[0];
    const kind = requirementKind(r, waived.has(r.id), result);
    return {
      id: r.id,
      text: ruleText(r, packs),
      strength:
        kind === "cant"
          ? "—"
          : effectiveImportance(r) === "hard"
            ? "HARD"
            : "PREF",
      kind,
    };
  });

  return {
    planId: input.planId,
    title: input.title,
    path: input.path,
    requirements: requirementViews,
    plans: [
      {
        id: "a",
        label: input.planLabel,
        items,
        merchandise: formatMoneyText(merchandise.amountMinor, currency),
        shipping: formatMoneyText(shippingMinor, currency),
        tax: formatMoneyText(taxMinor, currency),
        total: formatMoneyText(totalMinor, currency),
        tier,
        tierLabel,
      },
    ],
    proof: { headline, sub, ticks, rows },
    canReviewContract: gate.ok,
    ctaNote: gate.ok
      ? "Every hard rule passes or is waived. Review the exact contract next."
      : "The contract unlocks when every hard rule passes or is waived.",
    evidence,
  };
}
