import "server-only";
import {
  canonicalize,
  contractHash,
  hashJson,
  reportHash,
} from "@cartel/contracts";
import type { Json } from "@cartel/contracts/db";
import { type ApprovedState, approvalItems } from "@cartel/proof-engine";
import { CheckoutError } from "./checkout-service";
import { ALL_PACKS } from "./evidence";
import { createAdminClient } from "./supabase/admin";
/** Contract-draft integration point. Never reconstruct approval from today's catalog. */
export async function bindApprovedCheckout(
  versionId: string,
  sessionId: string,
  approved: ApprovedState,
) {
  const db = createAdminClient();
  const version = await db
    .from("contract_versions")
    .select("body_hash")
    .eq("id", versionId)
    .single();
  const hash = await contractHash(approved.contract);
  if (
    version.error ||
    version.data.body_hash !== hash ||
    approved.contract.proof.reportHash !== (await reportHash(approved.report))
  )
    throw new CheckoutError("approval_hash_mismatch");
  const items = await approvalItems(
    approved.snapshot,
    approved.contract.requirements,
    ALL_PACKS,
    approved.report.evaluatedAt,
  );
  if (canonicalize(items.items) !== canonicalize(approved.contract.items))
    throw new CheckoutError("approval_snapshot_mismatch");
  const state = { approval: true, checkout: approved.snapshot };
  const result = await db.rpc("srv_bind_approved_checkout", {
    p_version: versionId,
    p_session: sessionId,
    p_merchant: approved.contract.merchants[0]?.id ?? "",
    p_state: state as unknown as Json,
    p_hash: await hashJson(state),
  });
  if (result.error) throw new CheckoutError("approval_snapshot_not_saved", 503);
  return result.data;
}
