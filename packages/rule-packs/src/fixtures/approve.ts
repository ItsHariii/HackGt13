import {
  type AutonomyPolicy,
  autonomyPolicy,
  CONTRACT_SCHEMA,
  type ContractBody,
  type Hash,
  type Mandate,
  type Requirement,
  requirementSetHash,
  type Waiver,
} from "@cartel/contracts";
import {
  type ApprovedState,
  approvalItems,
  type CheckoutState,
  evaluate,
  type Pack,
} from "@cartel/proof-engine";
import { GREATHUB, GREATHUB_ORIGIN } from "./greathub";

export const FIXTURE_SUBJECT = "user:5f0c7a52-3b8e-4d61-9a2f-1c6e8b4d7a90";

/** Stand-in parent for a first modeled version whose predecessor isn't in the fixtures. */
export const UNMODELED_PARENT: Hash =
  "sha256:0000000000000000000000000000000000000000000000000000000000000000";

export type ApproveInit = {
  contractId: string;
  version: number;
  parentHash: Hash | null;
  planId: string;
  brief: string;
  requirements: Requirement[];
  checkout: CheckoutState;
  packs: readonly Pack[];
  now: string;
  maxTotalMinor: number;
  autonomy?: AutonomyPolicy;
  waivers?: Waiver[];
  mandate?: Mandate | null;
  issuedAt: string;
  expiresAt: string;
};

/**
 * Proves a checkout, then writes the contract body the user would sign for
 * it, with the report hash, item digests and economics the engine computed.
 * Returns everything `consentDiff` needs as the approved side.
 */
export async function approveCheckout(
  init: ApproveInit,
): Promise<ApprovedState> {
  const { checkout, requirements, packs, now } = init;
  const report = await evaluate({ ...checkout, requirements, packs, now });
  const { items, economics } = await approvalItems(
    checkout,
    requirements,
    packs,
    now,
  );
  const contract: ContractBody = {
    schema: CONTRACT_SCHEMA,
    contractId: init.contractId,
    version: init.version,
    parentHash: init.parentHash,
    planId: init.planId,
    subject: FIXTURE_SUBJECT,
    intent: {
      text: init.brief,
      requirementSetHash: await requirementSetHash(requirements),
    },
    requirements,
    items,
    economics: { ...economics, maxTotalMinor: init.maxTotalMinor },
    merchants: [{ id: GREATHUB, origin: GREATHUB_ORIGIN }],
    autonomy: init.autonomy ?? autonomyPolicy("balanced"),
    waivers: init.waivers ?? [],
    mandate: init.mandate ?? null,
    proof: {
      reportHash: report.hash,
      engineVersion: report.engineVersion,
      packs: report.packs,
    },
    issuedAt: init.issuedAt,
    expiresAt: init.expiresAt,
  };
  return { contract, report, snapshot: checkout };
}
