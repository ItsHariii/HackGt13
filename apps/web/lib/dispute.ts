import "server-only";
import { type DisputeScan, normalizeGtin } from "@cartel/evidence-pack";
import {
  disputePacket,
  flagshipOrderRecord,
  type OrderRecord,
  storedOrderRecord,
} from "./evidence-pack";
import { FLAGSHIP_ORDER } from "./flagship";
import { storedOrder } from "./orders";

/**
 * The dispute packet for an order the viewer can see (TASKS T15.4). Stored
 * orders read their scans from the ledger; the demo order records nothing,
 * so its scan arrives in the query string (`?gtin=…&method=typed`).
 */
export async function loadDispute(
  id: string,
  query: { gtin?: string | string[]; method?: string | string[] },
) {
  let record: OrderRecord | null;
  const extra: DisputeScan[] = [];
  if (id === FLAGSHIP_ORDER) {
    record = await flagshipOrderRecord();
    const gtin = normalizeGtin(String(query.gtin ?? ""));
    if (gtin)
      extra.push({
        gtin,
        method: query.method === "scan" ? "scan" : "typed",
        at: new Date().toISOString().replace(/\.\d+Z$/, "Z"),
        ledgerSeq: null,
      });
  } else {
    // RLS first: only the owner gets past this.
    const order = await storedOrder(id);
    record = order ? await storedOrderRecord(order.id) : null;
  }
  if (!record) return null;
  return { record, packet: disputePacket(record, extra) };
}
