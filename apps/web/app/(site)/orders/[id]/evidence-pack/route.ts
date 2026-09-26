import { FLAGSHIP_V8_SIGNATURE } from "@cartel/contracts/fixtures";
import { FLAGSHIP_ORDER, flagshipLedger, flagshipStory } from "@/lib/flagship";

/**
 * The Evidence Pack for the demo order (TASKS T11.9): the signed contract,
 * the proof report it names, the signature record and the hash-chained
 * ledger with payload text verbatim, so anyone can recompute every hash.
 * The signature bytes are the fixtures' shape-only stand-in.
 */
export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  if (id !== FLAGSHIP_ORDER)
    return Response.json({ error: "not_found" }, { status: 404 });
  const [s, ledger] = await Promise.all([flagshipStory(), flagshipLedger()]);
  const pack = {
    schema: "cartel.evidence-pack/demo-1",
    note: "Demo plan: data from the flagship fixtures; the signature is a shape-only stand-in.",
    order: FLAGSHIP_ORDER,
    contract: { hash: s.v8Hash, body: s.v8.contract },
    signature: FLAGSHIP_V8_SIGNATURE,
    proof: s.v8.report,
    recheck: s.v8Recheck.diff,
    ledger: ledger.map((e) => ({
      seq: e.seq,
      plan_id: e.planId,
      actor: e.actor,
      type: e.type,
      created_at: e.createdAt,
      payload_text: e.payloadText,
      prev_hash: e.prevHash,
      hash: e.hash,
    })),
  };
  return new Response(JSON.stringify(pack, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="evidence-pack-${FLAGSHIP_ORDER}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
