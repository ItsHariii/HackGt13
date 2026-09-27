import type { Value } from "@cartel/contracts";
import type { FieldDef } from "./fields";
import { parseMoney } from "./money";
import { fieldDef, type Pack } from "./pack";
import { parseMeasure } from "./parse";
import { isIsoDate, normalizeText } from "./values";

/*
 * Deterministic schema.org extraction (SDD §8.3 `jsonLd` map). A path is
 * dotted property names, where a step may filter an array by a property:
 * `offers.price`, `additionalProperty[name=Width].value`. The first path that
 * yields a readable value wins. Nothing here guesses: an unreadable value is
 * reported with `value: null` so the caller records "no fact".
 */

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

const STEP = /^([A-Za-z@][\w@]*)(?:\[([\w@]+)=([^\]]+)\])?$/;

/** Every value a path reaches (arrays fan out), in document order. */
export function resolveJsonLdPath(doc: unknown, path: string): unknown[] {
  let current: unknown[] = [doc];
  for (const step of path.split(".")) {
    const m = STEP.exec(step);
    if (!m) return [];
    const [, key, filterKey, filterValue] = m;
    const next: unknown[] = [];
    for (const node of current.flatMap((n) => (Array.isArray(n) ? n : [n]))) {
      if (typeof node !== "object" || node === null) continue;
      const child = (node as Record<string, unknown>)[key as string];
      if (child === undefined) continue;
      const children = Array.isArray(child) ? child : [child];
      for (const c of children) {
        if (filterKey === undefined) next.push(c);
        else if (
          typeof c === "object" &&
          c !== null &&
          String((c as Record<string, unknown>)[filterKey]).toLowerCase() ===
            (filterValue as string).toLowerCase()
        ) {
          next.push(c);
        }
      }
    }
    current = next;
  }
  return current;
}

/** UN/CEFACT codes schema.org uses in `unitCode`. */
const UNIT_CODES: Record<string, string> = {
  INH: "in",
  CMT: "cm",
  MMT: "mm",
  MTR: "m",
  FOT: "ft",
  GRM: "g",
  KGM: "kg",
  LBR: "lb",
  ONZ: "oz",
  WTT: "W",
  WHR: "Wh",
  MLT: "ml",
  LTR: "l",
  VLT: "V",
  P1: "%",
  DAY: "days",
};

/** Flattens a scalar or a `QuantitativeValue` into text the parser reads. */
function rawText(node: unknown): string | null {
  if (typeof node === "string") return node.trim() || null;
  if (typeof node === "number" && Number.isFinite(node)) return String(node);
  if (typeof node === "boolean") return String(node);
  if (typeof node === "object" && node !== null && !Array.isArray(node)) {
    const o = node as Record<string, Json>;
    const v = o.value ?? o["@value"];
    if (typeof v !== "string" && typeof v !== "number") return null;
    const unit =
      typeof o.unitText === "string"
        ? o.unitText
        : typeof o.unitCode === "string"
          ? UNIT_CODES[o.unitCode]
          : "";
    return `${v}${unit ? ` ${unit}` : ""}`.trim();
  }
  return null;
}

const TRUE = new Set([
  "true",
  "yes",
  "y",
  "1",
  "https://schema.org/true",
  "http://schema.org/true",
]);
const FALSE = new Set([
  "false",
  "no",
  "n",
  "0",
  "https://schema.org/false",
  "http://schema.org/false",
]);

/** Reads raw text as the field's kind. Null if it doesn't fit. */
/**
 * An enum value as sellers write it: "2560 × 1440 (QHD)", "3840x2160",
 * "4K UHD". Tries the whole text, the dimensions with the × normalized, the
 * text outside and inside parentheses, and each word; returns a value only
 * when every spelling that matches agrees, so a contradiction stays unknown.
 */
function readEnum(raw: string, def: FieldDef): string | null {
  const values = def.values ?? [];
  const text = raw.trim();
  const inside = [...text.matchAll(/\(([^)]*)\)/g)].map((m) => m[1] ?? "");
  const outside = text.replace(/\([^)]*\)/g, " ").trim();
  const dims = (s: string) => s.replace(/(\d)\s*[x×]\s*(\d)/gi, "$1x$2");
  const spellings = [text, dims(text), outside, dims(outside), ...inside];
  const words = [outside, ...inside].flatMap((s) => dims(s).split(/[\s,/]+/));
  const hits = new Set<string>();
  for (const s of [...spellings, ...words]) {
    if (!s.trim()) continue;
    const t = normalizeText(s, def);
    if (values.includes(t)) hits.add(t);
  }
  return hits.size === 1 ? ([...hits][0] as string) : null;
}

export function readAs(
  raw: string,
  def: FieldDef,
  currency?: string,
): Value | null {
  switch (def.kind) {
    case "money":
      return parseMoney(raw, currency);
    case "boolean": {
      const t = raw.trim().toLowerCase();
      return TRUE.has(t) ? true : FALSE.has(t) ? false : null;
    }
    case "enum":
      return readEnum(raw, def);
    case "date":
      return isIsoDate(raw.trim()) ? raw.trim() : null;
    case "list":
      return raw
        .split(/[,;/]/)
        .map((s) => s.trim())
        .filter(Boolean);
    case "text":
      return raw.trim() || null;
    case "subjective":
      return null;
    default:
      return parseMeasure(raw, {
        dimension: def.kind,
        ...(def.unit ? { defaultUnit: def.unit } : {}),
      });
  }
}

export type JsonLdExtraction = {
  field: string;
  path: string;
  raw: string;
  value: Value | null;
};

/**
 * Applies a pack's `jsonLd` map to one schema.org document. Returns one
 * entry per field that some path reached; `value` is null when the text
 * was found but couldn't be read as the field's kind.
 */
export function extractJsonLd(pack: Pack, doc: unknown): JsonLdExtraction[] {
  const currency = resolveJsonLdPath(doc, "offers.priceCurrency").find(
    (c) => typeof c === "string",
  ) as string | undefined;
  const out: JsonLdExtraction[] = [];
  for (const [field, paths] of Object.entries(pack.jsonLd).sort(([a], [b]) =>
    a < b ? -1 : 1,
  )) {
    const def = fieldDef(field, [pack]);
    let fallback: JsonLdExtraction | null = null;
    for (const path of paths) {
      for (const node of resolveJsonLdPath(doc, path)) {
        const raw = rawText(node);
        if (raw === null) continue;
        const value = def ? readAs(raw, def, currency) : raw;
        if (value !== null) {
          out.push({ field, path, raw, value });
          fallback = null;
          break;
        }
        fallback ??= { field, path, raw, value: null };
      }
      if (out.at(-1)?.field === field) break;
    }
    if (fallback && out.at(-1)?.field !== field) out.push(fallback);
  }
  return out;
}
