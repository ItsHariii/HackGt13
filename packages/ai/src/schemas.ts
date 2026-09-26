import { Importance, Operator } from "@cartel/contracts";
import { z } from "zod";

/*
 * What each bounded role may return (SDD §10.1). These are the model-facing
 * shapes, deliberately flat and stringly-typed: values arrive as the text a
 * person would write ("65 W", "$900", "2026-09-28") and the deterministic
 * parser in `@cartel/proof-engine` turns them into typed values. A model
 * never emits a `Requirement`, a `Fact` or anything the engine trusts.
 *
 * Every optional field is nullable rather than absent: structured outputs are
 * more reliable when the schema has no optional keys.
 */

const Rationale = z.string().max(300);

/** A1: one proposed requirement, before the ontology and quote checks. */
export const RequirementDraftSchema = z.object({
  field: z.string(),
  /** Which item the rule is about, when the field prefix is not a role. */
  role: z.string().nullable(),
  op: Operator,
  /** The target as written: `65 W`, `$900`, `2026-09-28`, `navy`, `true`. */
  value: z.string(),
  importance: Importance,
  /** Only for preferences: how much this one matters, 0–1. */
  weight: z.number().min(0).max(1).nullable(),
  /** Verbatim words from the brief, when the user asked for this. */
  quote: z.string().nullable(),
  rationale: Rationale,
});
export type RequirementDraft = z.infer<typeof RequirementDraftSchema>;

export const QuestionSchema = z.object({
  /** The field the answer would set, when the question is about one. */
  field: z.string().nullable(),
  question: z.string().max(200),
  why: Rationale,
});
export type Question = z.infer<typeof QuestionSchema>;

export const BriefAnalysisSchema = z.object({
  /** The rule pack the brief belongs to, from the packs offered. */
  pack: z.string().nullable(),
  requirements: z.array(RequirementDraftSchema).max(40),
  questions: z.array(QuestionSchema).max(8),
});
export type BriefAnalysis = z.infer<typeof BriefAnalysisSchema>;

/** A2: roles to fill and the searches that would fill them. */
export const RoleProposalSchema = z.object({
  role: z.string(),
  label: z.string().max(60),
  required: z.boolean(),
  rationale: Rationale,
});
export type RoleProposal = z.infer<typeof RoleProposalSchema>;

export const CandidateQuerySchema = z.object({
  role: z.string(),
  query: z.string().max(120),
  /** Words that must appear in a result's title or specs. */
  mustInclude: z.array(z.string().max(40)).max(6),
});
export type CandidateQuery = z.infer<typeof CandidateQuerySchema>;

export const RolePlanSchema = z.object({
  roles: z.array(RoleProposalSchema).max(12),
  queries: z.array(CandidateQuerySchema).max(24),
});
export type RolePlan = z.infer<typeof RolePlanSchema>;

/** A3: a proposed fact. Only the evidence system can promote one (SDD §10.2). */
export const FactCandidateSchema = z.object({
  field: z.string(),
  /** The value as the text states it. */
  rawValue: z.string(),
  /** A verbatim span of the source text that contains that value. */
  quote: z.string().max(400),
});
export type FactCandidateOut = z.infer<typeof FactCandidateSchema>;

export const ExtractionSchema = z.object({
  candidates: z.array(FactCandidateSchema).max(20),
});
export type Extraction = z.infer<typeof ExtractionSchema>;

/** A4: a refinement command, before it becomes a `RequirementPatch`. */
export const PatchProposalSchema = z.object({
  op: z.enum(["add", "remove", "replace"]),
  /** The requirement to change or remove; null when adding. */
  requirementId: z.string().nullable(),
  /** The field to add; null when changing or removing. */
  field: z.string().nullable(),
  operator: Operator.nullable(),
  value: z.string().nullable(),
  importance: Importance.nullable(),
  weight: z.number().min(0).max(1).nullable(),
  rationale: Rationale,
});
export type PatchProposal = z.infer<typeof PatchProposalSchema>;

export const RefinementSchema = z.object({
  patches: z.array(PatchProposalSchema).max(12),
  /** Anything the command asked for that the patches do not cover. */
  unhandled: z.array(z.string().max(160)).max(4),
});
export type Refinement = z.infer<typeof RefinementSchema>;

/** A5: wording only. Every number must already appear in the input JSON. */
export const SummarySchema = z.object({
  summary: z.string().max(600),
});
export type Summary = z.infer<typeof SummarySchema>;
