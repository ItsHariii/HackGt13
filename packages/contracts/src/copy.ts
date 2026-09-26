import type { ChangeClass, DiffClassification } from "./consent";
import type {
  EvidenceState,
  Importance,
  ReasonCode,
  Verdict,
} from "./primitives";
import type { ProvenanceKind } from "./requirement";

/*
 * User-facing wording shared by the web app and the Evidence Pack PDF
 * (SDD §7.3, §17.3). Rules: "Confirmed" only for `verified`, always with the
 * source and its age; claims are attributed to their source; unknowns are
 * said plainly. Never "guaranteed", "safe", "authentic", "will fit".
 */

/** Compact relative age: `just now`, `4 min ago`, `3 h ago`, `12 d ago`. */
export function formatAge(ageSeconds: number): string {
  if (!Number.isFinite(ageSeconds) || ageSeconds < 60) return "just now";
  if (ageSeconds < 3600) return `${Math.floor(ageSeconds / 60)} min ago`;
  if (ageSeconds < 86_400) return `${Math.floor(ageSeconds / 3600)} h ago`;
  return `${Math.floor(ageSeconds / 86_400)} d ago`;
}

/**
 * The evidence badge text for a fact or result. `source` is a display name
 * ("Manufacturer", "GreatHub checkout"); `ageSeconds` is time since fetch.
 * Without an age, a verified value is only attributed, never "Confirmed".
 */
export function evidenceLabel(
  state: EvidenceState,
  source: string,
  ageSeconds: number | null,
  reason?: ReasonCode | null,
): string {
  switch (state) {
    case "verified":
      return ageSeconds === null
        ? `${source} says`
        : `Confirmed · ${source} · ${formatAge(ageSeconds)}`;
    case "source_stated":
      return `${source} says`;
    case "supported":
      return "Evidence suggests";
    case "estimated":
      return "Estimate";
    case "unknown":
      return reason === "conflict" ? "Sources disagree" : "Can't check";
  }
}

/** Status text that reads correctly without color. */
export function verdictLabel(
  verdict: Verdict,
  importance: Importance,
  waived = false,
): string {
  if (verdict === "unknown") {
    return waived ? "Can't check · you accepted this" : "Can't check";
  }
  if (importance === "hard") {
    return verdict === "pass"
      ? "Meets requirement"
      : "Doesn't meet requirement";
  }
  return verdict === "pass" ? "Preference met" : "Preference not met";
}

const PROVENANCE: Record<ProvenanceKind, string> = {
  user_stated: "You said",
  user_selected: "You chose",
  ai_inferred: "I assumed",
  pack_default: "Default",
};

export function provenanceLabel(kind: ProvenanceKind): string {
  return PROVENANCE[kind];
}

const REASON: Record<ReasonCode, string> = {
  not_satisfied: "Doesn't meet the target",
  insufficient_evidence: "Not enough evidence to confirm",
  no_fact: "No source states this",
  stale: "Information is out of date",
  conflict: "Sources disagree",
  subjective: "Subjective, so it can't be checked",
  role_missing: "Nothing chosen for this role yet",
  total_mismatch: "Merchant total doesn't match the line items",
  incomparable: "These values can't be compared",
};

export function reasonLabel(reason: ReasonCode): string {
  return REASON[reason];
}

const CLASSIFICATION: Record<DiffClassification, string> = {
  identical: "No changes",
  auto: "Changed within your rules",
  reapprove: "Needs your approval",
  block: "Purchase paused",
};

export function classificationLabel(c: DiffClassification): string {
  return CLASSIFICATION[c];
}

const CHANGE_CLASS: Record<ChangeClass, string> = {
  info: "For your information",
  auto: "Accepted automatically",
  reapprove: "Needs your approval",
  block: "Blocks this purchase",
};

export function changeClassLabel(c: ChangeClass): string {
  return CHANGE_CLASS[c];
}
