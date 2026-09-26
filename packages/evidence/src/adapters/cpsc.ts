import {
  type FetchLike,
  httpRequest,
  parseJsonBody,
  SourceError,
} from "../http";
import {
  cachedFetch,
  isSuccess,
  type Snapshot,
  type SnapshotStore,
} from "../snapshot";
import type { ClaimedFact } from "../types";

/*
 * CPSC recalls (SDD §11.2, T7.4). saferproducts.gov is keyless and matches
 * `ProductName` as a substring ("anker" also finds "Trankerloop"), so the
 * query is broad and the match is ours: the brand must appear as a word and
 * the model number (or GTIN) must appear too. A brand-only hit is not called
 * a recall, but it isn't called safe either: the fact is left unknown.
 *
 * The UI says "No recall found in CPSC as of {time}", never "safe".
 */

export const CPSC_RECALL_URL =
  "https://www.saferproducts.gov/RestWebServices/Recall";
export const RECALL_FIELD = "recall.active";
const DAY_MS = 86_400_000;

type Named = { Name?: string | null };
export type CpscRecall = {
  RecallID?: number;
  RecallNumber?: string;
  RecallDate?: string;
  Title?: string;
  Description?: string;
  URL?: string;
  Products?: (Named & { Model?: string | null; Description?: string | null })[];
  Manufacturers?: Named[];
  ProductUPCs?: ({ UPC?: string | null } | string)[];
};

export type RecallMatch = {
  recallNumber: string;
  title: string;
  url: string | null;
  recallDate: string | null;
  /** What tied it to the product. */
  matchedBy: "model" | "gtin";
};

export type RecallQuery = {
  brand: string;
  model?: string | null;
  gtin?: string | null;
};

export type RecallCheck = {
  /** true / false, or null when the brand has recalls but there is no model to match on. */
  active: boolean | null;
  matches: RecallMatch[];
  /** Recalls naming the brand that didn't match the model; shown, never counted. */
  brandOnly: string[];
};

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The brand as a whole word, case-insensitive. */
function brandPattern(brand: string): RegExp {
  const words = brand.trim().split(/\s+/).map(escapeRe);
  return new RegExp(
    `(?<![\\p{L}\\p{N}])${words.join("\\s+")}(?![\\p{L}\\p{N}])`,
    "iu",
  );
}

/**
 * The model as a token, tolerant of separators: "VP2785-4K" matches
 * "VP2785 4K" and "VP27854K", but "A164" does not match "A1642".
 */
function modelPattern(model: string): RegExp | null {
  const groups = model.toUpperCase().match(/[A-Z0-9]+/g);
  if (!groups || groups.join("").length < 3) return null;
  return new RegExp(
    `(?<![A-Z0-9])${groups.map(escapeRe).join("[\\s\\-_/.]?")}(?![A-Z0-9])`,
    "i",
  );
}

function recallText(r: CpscRecall): string {
  return [
    r.Title,
    r.Description,
    ...(r.Products ?? []).flatMap((p) => [p.Name, p.Model, p.Description]),
    ...(r.Manufacturers ?? []).map((m) => m.Name),
  ]
    .filter((s): s is string => typeof s === "string" && s.length > 0)
    .join("\n");
}

function upcs(r: CpscRecall): string[] {
  return (r.ProductUPCs ?? [])
    .map((u) => (typeof u === "string" ? u : (u.UPC ?? "")))
    .map((u) => u.replace(/\D/g, ""))
    .filter(Boolean);
}

/** Matches recalls to one product. Pure. */
export function matchRecalls(
  recalls: readonly CpscRecall[],
  q: RecallQuery,
): RecallCheck {
  const brand = brandPattern(q.brand);
  const model = q.model ? modelPattern(q.model) : null;
  const gtin = q.gtin?.replace(/\D/g, "").replace(/^0+/, "");
  const matches: RecallMatch[] = [];
  const brandOnly: string[] = [];
  for (const r of recalls) {
    const text = recallText(r);
    const byGtin = !!gtin && upcs(r).some((u) => u.replace(/^0+/, "") === gtin);
    if (!byGtin && !brand.test(text)) continue;
    const number = r.RecallNumber ?? String(r.RecallID ?? "");
    if (byGtin || model?.test(text)) {
      matches.push({
        recallNumber: number,
        title: r.Title ?? "",
        url: r.URL ?? null,
        recallDate: r.RecallDate ? r.RecallDate.slice(0, 10) : null,
        matchedBy: byGtin ? "gtin" : "model",
      });
    } else {
      brandOnly.push(number);
    }
  }
  const active =
    matches.length > 0
      ? true
      : !model && !gtin && brandOnly.length > 0
        ? null
        : false;
  return { active, matches, brandOnly };
}

/** The recall fact for a check: `verified` either way, unknown when it couldn't be decided. */
export function recallClaim(
  check: RecallCheck,
  retrievedAt: string,
  extractor = "cpsc",
): ClaimedFact {
  const freshUntil = new Date(Date.parse(retrievedAt) + DAY_MS).toISOString();
  if (check.active === null) {
    return {
      field: RECALL_FIELD,
      value: null,
      raw: `brand recalls: ${check.brandOnly.join(", ")}`,
      state: "unknown",
      reason: "insufficient_evidence",
      extractor,
      freshUntil,
    };
  }
  return {
    field: RECALL_FIELD,
    value: check.active,
    raw: check.matches.map((m) => m.recallNumber).join(", ") || "none",
    state: "verified",
    extractor,
    freshUntil,
  };
}

/** "No recall found in CPSC as of 10:42" / "Recalled: 25011 (CPSC)". Never "safe". */
export function recallLabel(
  check: Pick<RecallCheck, "active" | "matches">,
  asOf: Date,
  sourceLabel = "CPSC",
): string {
  if (check.active === true)
    return `Recalled: ${check.matches.map((m) => m.recallNumber).join(", ")} (${sourceLabel})`;
  if (check.active === null)
    return `Can't check recalls without a model number (${sourceLabel})`;
  const t = asOf.toISOString().slice(11, 16);
  return `No recall found in ${sourceLabel} as of ${t} UTC`;
}

export type CpscOptions = {
  store: SnapshotStore;
  fetch?: FetchLike;
  /** Point at DemoMart's `/api/mock-cpsc` in demo mode; it must speak the same JSON. */
  baseUrl?: string;
  /** Shown in labels: "CPSC" or "Mock CPSC (demo)". */
  label?: string;
  /** Default 1 h: recall status is refreshed before signing (SDD §11.4). */
  cacheTtlMs?: number;
  timeoutMs?: number;
  now?: () => Date;
};

export function createCpscAdapter(opts: CpscOptions) {
  const base = opts.baseUrl ?? CPSC_RECALL_URL;
  const label = opts.label ?? "CPSC";
  return {
    label,
    async checkRecalls(
      q: RecallQuery,
    ): Promise<{ source: Snapshot; check: RecallCheck; claim: ClaimedFact }> {
      if (!q.brand.trim())
        throw new SourceError(
          label,
          "invalid_response",
          "a brand is required to search recalls",
        );
      const url = `${base}?format=json&ProductName=${encodeURIComponent(q.brand.trim())}`;
      const source = await cachedFetch(
        {
          key: url,
          sourceType: "cpsc",
          ttlMs: opts.cacheTtlMs ?? 3_600_000,
          ...(opts.now ? { now: opts.now } : {}),
          fetch: () =>
            httpRequest({
              source: label,
              url,
              headers: { Accept: "application/json" },
              ...(opts.fetch ? { fetch: opts.fetch } : {}),
              ...(opts.timeoutMs ? { timeoutMs: opts.timeoutMs } : {}),
              ...(opts.now ? { now: opts.now } : {}),
            }),
        },
        opts.store,
      );
      if (!isSuccess(source))
        throw new SourceError(
          label,
          "http",
          `HTTP ${source.httpStatus}`,
          source.httpStatus ?? undefined,
        );
      const body = parseJsonBody(label, source.bytes);
      if (!Array.isArray(body))
        throw new SourceError(
          label,
          "invalid_response",
          "expected an array of recalls",
        );
      const check = matchRecalls(body as CpscRecall[], q);
      return { source, check, claim: recallClaim(check, source.fetchedAt) };
    },
  };
}
