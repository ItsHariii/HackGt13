import type { EvidenceState, Quantity, Value } from "@proofcart/contracts";
import {
  type Authority,
  capState,
  type FieldDef,
  freshnessMs,
  isQuantity,
} from "@proofcart/proof-engine";
import type {
  ClaimedFact,
  FactDraft,
  SourceRecord,
  SubjectKind,
} from "./types";

/*
 * How strong a claim is when it is first stored (SDD §7.3). The engine
 * re-applies freshness and caps at read time; storing the capped state too
 * keeps the database honest for anyone reading it directly.
 */

/**
 * - The user and the government recall database are authorities by definition.
 * - A merchant's checkout or a manufacturer's spec sheet is `verified` only
 *   for fields whose pack names that authority; otherwise it is a claim.
 * - Merchant pages, catalogs and quote-checked text are `source_stated`.
 */
export function claimState(
  authority: Authority,
  def: FieldDef | undefined,
): EvidenceState {
  let state: EvidenceState;
  switch (authority) {
    case "user":
    case "government":
      state = "verified";
      break;
    case "merchant_checkout":
    case "manufacturer":
      state = def?.authority?.includes(authority)
        ? "verified"
        : "source_stated";
      break;
    default:
      state = "source_stated";
  }
  return capState(state, def?.maxState);
}

/** When a fact read at `retrievedAt` stops being usable, per the field's freshness (SDD §11.4). */
export function freshUntilFor(
  def: FieldDef | undefined,
  retrievedAt: string,
): string | undefined {
  if (!def?.freshness) return undefined;
  return new Date(
    Date.parse(retrievedAt) + freshnessMs(def.freshness),
  ).toISOString();
}

/** A readable value becomes a claim at the source's strength; an unreadable one is "no fact". */
export function claim(
  field: string,
  value: Value | null,
  raw: string | undefined,
  authority: Authority,
  def: FieldDef | undefined,
  extractor: string,
): ClaimedFact {
  if (value === null) {
    return {
      field,
      value: null,
      ...(raw ? { raw } : {}),
      state: "unknown",
      reason: "no_fact",
      extractor,
    };
  }
  return {
    field,
    value,
    ...(raw ? { raw } : {}),
    state: claimState(authority, def),
    extractor,
  };
}

/** Binds claims to a stored subject and the snapshot they came from. */
export function toDrafts(
  claims: readonly ClaimedFact[],
  subject:
    | { kind: SubjectKind; id: string }
    | ((c: ClaimedFact) => { kind: SubjectKind; id: string } | null),
  source: Pick<SourceRecord, "id" | "fetchedAt">,
  defFor: (field: string) => FieldDef | undefined,
): FactDraft[] {
  const out: FactDraft[] = [];
  for (const c of claims) {
    const s = typeof subject === "function" ? subject(c) : subject;
    if (!s) continue;
    const freshUntil =
      c.freshUntil ?? freshUntilFor(defFor(c.field), source.fetchedAt);
    out.push({
      subjectKind: s.kind,
      subjectId: s.id,
      field: c.field,
      value: c.value,
      ...(c.raw !== undefined ? { raw: c.raw } : {}),
      state: c.state,
      ...(c.reason ? { reason: c.reason } : {}),
      sourceId: source.id,
      ...(c.quote !== undefined && c.span
        ? { quote: c.quote, span: c.span }
        : {}),
      extractor: c.extractor,
      retrievedAt: source.fetchedAt,
      ...(freshUntil ? { freshUntil } : {}),
    });
  }
  return out;
}

/** The `unit` and `qualifier` columns, denormalized from a quantity value for querying. */
export function unitColumns(value: Value | null): {
  unit: string | null;
  qualifier: string | null;
} {
  if (isQuantity(value))
    return {
      unit: value.unit,
      qualifier: (value as Quantity).qualifier ?? null,
    };
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    "unit" in value
  ) {
    return { unit: String(value.unit), qualifier: null };
  }
  return { unit: null, qualifier: null };
}

/** GS1 mod-10 check, the same rule as `public.is_valid_gtin`. */
export function isValidGtin(gtin: string): boolean {
  if (!/^(?:\d{8}|\d{12,14})$/.test(gtin)) return false;
  const digits = [...gtin].map(Number);
  const check = digits.pop() as number;
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    // Weights alternate 3, 1, … from the digit nearest the check digit.
    sum += (digits[digits.length - 1 - i] as number) * (i % 2 === 0 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10 === check;
}

/**
 * GTIN-8/12/13/14 → GTIN-14, or undefined if it isn't a valid GTIN.
 * One canonical form, so a UPC-A from one source and an EAN-13 from another
 * merge into the same product (SDD §11.5).
 */
export function normalizeGtin(
  raw: string | null | undefined,
): string | undefined {
  const digits = raw?.replace(/[\s-]/g, "");
  if (!digits || !isValidGtin(digits)) return undefined;
  return digits.padStart(14, "0");
}
