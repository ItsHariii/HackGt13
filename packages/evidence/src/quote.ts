import type { Value } from "@proofcart/contracts";
import {
  type FieldDef,
  type FieldKind,
  fieldDef,
  type Pack,
  readAs,
  sameValue,
} from "@proofcart/proof-engine";
import { claimState } from "./claims";
import { type ClaimedFact, SOURCE_AUTHORITY } from "./types";

/*
 * Quote-grounded extraction (SDD §10.2, T7.6). A model may *propose* a fact
 * from unstructured text; only this module can turn the proposal into a
 * stored claim, and only when:
 *
 *   1. the quote occurs in the source text (after whitespace/Unicode
 *      normalization only — no case folding, no fuzzy matching),
 *   2. the deterministic parser reads the claimed value, and
 *   3. the quote contains exactly that value, and nothing contradicting it.
 *
 * Accepted facts are capped at `source_stated`, carry the verbatim source
 * substring as their quote and its span in the original text, and are never
 * stronger than the text they came from.
 */

/** What the fast model returns for each field it thinks it found (SDD §10.1, A3). */
export type FactCandidate = {
  field: string;
  rawValue: string;
  quote: string;
};

export type ExtractionField = { field: string; label: string; kind: FieldKind };

/** The model call. `@proofcart/ai` provides one; it never sees tools. */
export type FactExtractor = (input: {
  text: string;
  fields: readonly ExtractionField[];
  signal?: AbortSignal;
}) => Promise<readonly FactCandidate[]>;

export type RejectionReason =
  | "unknown_field"
  | "not_requested"
  | "subjective"
  | "quote_not_found"
  | "unparseable"
  | "value_not_in_quote"
  | "ambiguous_quote";

export type Rejection = { candidate: FactCandidate; reason: RejectionReason };

export type QuotedClaim = ClaimedFact & {
  quote: string;
  span: [number, number];
};

export type Normalized = {
  text: string;
  /** For each index of `text`, the index in the original string it came from. */
  origin: number[];
  /** For each index of `text`, where its original character ends (exclusive). */
  originEnd: number[];
};

/**
 * NFKC per character and whitespace runs collapsed to one space, keeping a
 * map back to the original offsets so a span can highlight the snapshot.
 */
export function normalizeQuoteText(input: string): Normalized {
  const text: string[] = [];
  const origin: number[] = [];
  const originEnd: number[] = [];
  let i = 0;
  for (const ch of input) {
    const start = i;
    i += ch.length;
    if (/\s/u.test(ch)) {
      if (text.length > 0 && text[text.length - 1] !== " ") {
        text.push(" ");
        origin.push(start);
        originEnd.push(i);
      }
      continue;
    }
    for (const unit of ch.normalize("NFKC")) {
      for (let k = 0; k < unit.length; k++) {
        text.push(unit[k] as string);
        origin.push(start);
        originEnd.push(i);
      }
    }
  }
  while (text[text.length - 1] === " ") {
    text.pop();
    origin.pop();
    originEnd.pop();
  }
  return { text: text.join(""), origin, originEnd };
}

/** Where a quote occurs in the source, in original offsets; null if it doesn't. */
export function locateQuote(
  source: Normalized,
  quote: string,
): [number, number] | null {
  const q = normalizeQuoteText(quote).text;
  if (!q) return null;
  const at = source.text.indexOf(q);
  if (at < 0) return null;
  return [
    source.origin[at] as number,
    source.originEnd[at + q.length - 1] as number,
  ];
}

/** Kinds checked by substring; every other kind is checked by parsing the quote. */
const TEXTUAL = new Set<FieldKind>(["boolean", "enum", "text", "list"]);
const MAX_WINDOW = 6;

function isMeasured(def: FieldDef): boolean {
  return !TEXTUAL.has(def.kind);
}

type Reading = { value: Value; start: number; end: number };

/**
 * Every value the parser can read from a contiguous run of words in the
 * quote, longest reading first, with the word range it came from. For
 * measured fields only.
 */
function readingsInQuote(quote: string, def: FieldDef): Reading[] {
  const words = normalizeQuoteText(quote).text.split(" ").filter(Boolean);
  const found: Reading[] = [];
  for (let len = Math.min(MAX_WINDOW, words.length); len >= 1; len--) {
    for (let s = 0; s + len <= words.length; s++) {
      const text = words
        .slice(s, s + len)
        .join(" ")
        .replace(/^[([{"']+|[)\]}"',.;:]+$/g, "");
      const v = text ? readAs(text, def) : null;
      if (v !== null) found.push({ value: v, start: s, end: s + len });
    }
  }
  return found;
}

/**
 * The claimed value's reading, or why there isn't one. A reading inside the
 * words of a matching one ("9 in" within "21.5 x 14 x 9 in") is part of it,
 * not a rival; any other different value makes the quote ambiguous.
 */
function matchInQuote(
  quote: string,
  claimed: Value,
  def: FieldDef,
): Value | "value_not_in_quote" | "ambiguous_quote" {
  const readings = readingsInQuote(quote, def);
  const matching = readings.filter((r) => sameValue(r.value, claimed, def));
  const first = matching[0];
  if (!first) return "value_not_in_quote";
  const rival = readings.some(
    (r) =>
      !sameValue(r.value, claimed, def) &&
      !matching.some((m) => m.start <= r.start && r.end <= m.end),
  );
  // The longest reading keeps qualifiers the model dropped ("up to 90 W").
  return rival ? "ambiguous_quote" : first.value;
}

function fold(s: string): string {
  return normalizeQuoteText(s).text.toLowerCase();
}

export type VerifyOptions = {
  packs: readonly Pack[];
  /** Fields the model was asked for; anything else is rejected. */
  fields?: readonly string[];
  extractor?: string;
};

/** Checks each candidate against the source text. Pure and deterministic. */
export function verifyCandidates(
  sourceText: string,
  candidates: readonly FactCandidate[],
  opts: VerifyOptions,
): { accepted: QuotedClaim[]; rejected: Rejection[] } {
  const source = normalizeQuoteText(sourceText);
  const accepted: QuotedClaim[] = [];
  const rejected: Rejection[] = [];
  const reject = (candidate: FactCandidate, reason: RejectionReason) =>
    rejected.push({ candidate, reason });

  for (const c of candidates) {
    const def = fieldDef(c.field, opts.packs);
    if (!def) {
      reject(c, "unknown_field");
      continue;
    }
    if (opts.fields && !opts.fields.includes(c.field)) {
      reject(c, "not_requested");
      continue;
    }
    if (def.kind === "subjective") {
      reject(c, "subjective");
      continue;
    }
    const span = locateQuote(source, c.quote);
    if (!span) {
      reject(c, "quote_not_found");
      continue;
    }
    const claimed = readAs(c.rawValue, def);
    if (claimed === null) {
      reject(c, "unparseable");
      continue;
    }
    let value: Value = claimed;
    if (isMeasured(def)) {
      const match = matchInQuote(c.quote, claimed, def);
      if (match === "value_not_in_quote" || match === "ambiguous_quote") {
        reject(c, match);
        continue;
      }
      value = match;
    } else if (!fold(c.quote).includes(fold(c.rawValue))) {
      reject(c, "value_not_in_quote");
      continue;
    }
    accepted.push({
      field: c.field,
      value,
      raw: c.rawValue,
      state: claimState(SOURCE_AUTHORITY.unstructured, def),
      extractor: opts.extractor ?? "llm:fast@A3",
      quote: sourceText.slice(span[0], span[1]),
      span,
    });
  }
  return { accepted, rejected };
}

export type ExtractQuotedOptions = Omit<VerifyOptions, "extractor"> & {
  text: string;
  fields: readonly string[];
  extractor: FactExtractor;
  /** Stored on each fact; defaults to `llm:fast@A3`. */
  extractorId?: string;
  signal?: AbortSignal;
};

/**
 * Runs the model over untrusted text and keeps only what the text proves.
 * With no model available the caller simply skips this; fields stay unknown.
 */
export async function extractQuotedFacts(
  opts: ExtractQuotedOptions,
): Promise<{ accepted: QuotedClaim[]; rejected: Rejection[] }> {
  const fields: ExtractionField[] = [];
  for (const field of opts.fields) {
    const def = fieldDef(field, opts.packs);
    if (def && def.kind !== "subjective")
      fields.push({ field, label: def.label, kind: def.kind });
  }
  if (fields.length === 0 || !opts.text.trim())
    return { accepted: [], rejected: [] };
  const candidates = await opts.extractor({
    text: opts.text,
    fields,
    ...(opts.signal ? { signal: opts.signal } : {}),
  });
  return verifyCandidates(opts.text, candidates, {
    packs: opts.packs,
    fields: opts.fields,
    ...(opts.extractorId ? { extractor: opts.extractorId } : {}),
  });
}
