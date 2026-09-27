import { ContractBody } from "@cartel/contracts";
import { RAIL_LABELS } from "@cartel/payments";
import { jsonResponse, UUID, userId } from "@/lib/catalog";
import { paymentError, paymentRailId } from "@/lib/payment-config";
import { createAdminClient } from "@/lib/supabase/admin";
export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const owner = await userId();
    const { id } = await ctx.params;
    if (!UUID.test(id)) return jsonResponse({ error: "invalid_plan" }, 400);
    const db = createAdminClient();
    const plan = await db
      .from("plans")
      .select("id")
      .eq("id", id)
      .eq("user_id", owner)
      .maybeSingle();
    if (!plan.data || plan.error)
      return jsonResponse({ error: "plan_not_found" }, 404);
    const [versions, instruments] = await Promise.all([
      db
        .from("contract_versions")
        .select(
          "id,version,status,body,payment_executions(id,status,created_at,orders(id))",
        )
        .eq("plan_id", id)
        .order("version", { ascending: false }),
      db
        .from("payment_instruments")
        .select("id,brand,last4,rail")
        .eq("user_id", owner)
        .eq("rail", paymentRailId()),
    ]);
    if (versions.error || instruments.error) throw new Error("read_failed");
    const seen = new Set<string>();
    const merchants = versions.data.flatMap((v) => {
      const contract = ContractBody.parse(v.body);
      return contract.merchants.flatMap((m) => {
        if (seen.has(m.id)) return [];
        seen.add(m.id);
        const execution = [...v.payment_executions].sort((a, b) =>
          b.created_at.localeCompare(a.created_at),
        )[0];
        const order = execution?.orders;
        const orderId = Array.isArray(order) ? order[0]?.id : order?.id;
        return [
          {
            merchant: m.id,
            ...(execution?.status === "authorized" && orderId
              ? { receiptUrl: `/orders/${orderId}` }
              : {}),
            versionId: v.id,
            contractStatus: v.status,
            status:
              execution?.status === "authorized"
                ? "paid"
                : execution?.status === "started"
                  ? "reconcile_required"
                  : execution
                    ? "failed"
                    : "not_attempted",
            handoff:
              contract.merchants.length === 1 &&
              m.id !== "greathub" &&
              ["signed", "armed"].includes(v.status),
            executable:
              contract.merchants.length === 1 &&
              m.id === "greathub" &&
              ["signed", "armed", "failed", "executing"].includes(v.status),
          },
        ];
      });
    });
    return jsonResponse({
      merchants,
      instruments: instruments.data,
      label: RAIL_LABELS[paymentRailId()],
    });
  } catch (error) {
    return paymentError(error);
  }
}
