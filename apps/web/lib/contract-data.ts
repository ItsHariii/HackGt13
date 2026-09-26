import "server-only";
import { ContractBody, ProofReport } from "@cartel/contracts";
import { packsFor } from "@cartel/rule-packs";
import { UUID } from "./catalog";
import {
  buildContractView,
  type ContractView,
  contractDiffLines,
  formatStamp,
} from "./contract-view";
import { createClient } from "./supabase/server";

export type StoredContract = {
  versionId: string;
  status: string;
  view: ContractView;
  revision: {
    lines: ReturnType<typeof contractDiffLines>;
    from: string;
    to: string;
    reason: string;
  } | null;
  versions: { version: number; status: string }[];
};

/**
 * A saved plan's contract version, through the person's own session (RLS),
 * with the proof report it names. `version` defaults to the newest.
 */
export async function loadStoredContract(
  planId: string,
  version?: number,
): Promise<StoredContract | null> {
  if (!UUID.test(planId)) return null;
  const db = await createClient();
  if (!db) return null;
  const { data: rows, error } = await db
    .from("contract_versions")
    .select("id,version,status,body,body_hash,signed_at,proof_report_id")
    .eq("plan_id", planId)
    .order("version", { ascending: false });
  if (error || !rows?.length) return null;
  const row = version ? rows.find((r) => r.version === version) : rows[0];
  if (!row) return null;
  const body = ContractBody.safeParse(row.body);
  if (!body.success || !row.proof_report_id) return null;
  const [plan, report] = await Promise.all([
    db.from("plans").select("title").eq("id", planId).maybeSingle(),
    db
      .from("proof_reports")
      .select("report")
      .eq("id", row.proof_report_id)
      .maybeSingle(),
  ]);
  const parsed = ProofReport.safeParse(report.data?.report);
  if (!parsed.success) return null;
  let packs: ReturnType<typeof packsFor>;
  try {
    packs = packsFor(body.data.proof.packs);
  } catch {
    return null;
  }
  const parent = rows.find((r) => r.version === row.version - 1);
  const parentBody = parent ? ContractBody.safeParse(parent.body) : null;
  return {
    versionId: row.id,
    status: row.status,
    view: buildContractView({
      planId,
      title: plan.data?.title ?? "Plan",
      contract: body.data,
      report: parsed.data,
      hash: row.body_hash,
      packs,
      signedAt: row.signed_at ? formatStamp(row.signed_at) : null,
    }),
    revision:
      parent && parentBody?.success
        ? {
            lines: contractDiffLines(parentBody.data, body.data, packs),
            from: parent.body_hash,
            to: row.body_hash,
            reason: `This version replaces v${parent.version}.`,
          }
        : null,
    versions: rows.map((r) => ({ version: r.version, status: r.status })),
  };
}
