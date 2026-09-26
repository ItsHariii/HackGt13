import type { Pack } from "@cartel/proof-engine";
import type { createGreatHubAdapter } from "./adapters/greathub";
import { applyCheckoutOffer, writeClaims } from "./ingest";
import type { Db, EvidenceStore } from "./supabase";

/*
 * Fact refresh worker (SDD §11.4, §19.4, T7.8). Cron `offers-refresh`
 * enqueues offers in live contracts whose facts are about to go stale and
 * wakes `/api/internal/queue/fact_refresh`; this drains `q_fact_refresh`.
 *
 * A message is archived after it is handled (or found not refreshable); a
 * failure leaves it to reappear after the visibility timeout, and after
 * `maxReads` attempts it moves to `q_fact_refresh_dlq`.
 */

export const FACT_REFRESH_QUEUE = "q_fact_refresh";
const MAX_SKEW_S = 300;

function hex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Checks the cron wake-up signature (0010_jobs.sql): `x-cartel-signature:
 * v1=hex(hmac_sha256(secret, "{timestamp}.{queue}"))`, timestamp within 5 min.
 */
export async function verifyQueueWake(
  headers: Headers,
  queue: string,
  secret: string,
  nowMs: number = Date.now(),
): Promise<boolean> {
  const ts = headers.get("x-cartel-timestamp") ?? "";
  const sig = headers.get("x-cartel-signature") ?? "";
  if (!/^\d{1,12}$/.test(ts) || !sig.startsWith("v1=") || !secret) return false;
  if (Math.abs(nowMs / 1000 - Number(ts)) > MAX_SKEW_S) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const expected = `v1=${hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${ts}.${queue}`)))}`;
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++)
    diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}

export type QueueMessage = { msgId: number; readCt: number; message: unknown };

export interface QueueStore {
  read(
    queue: string,
    visibilityS: number,
    qty: number,
  ): Promise<QueueMessage[]>;
  send(queue: string, message: unknown): Promise<void>;
  archive(queue: string, msgId: number): Promise<void>;
}

export function supabaseQueueStore(db: Db): QueueStore {
  return {
    async read(queue, vt, qty) {
      const { data, error } = await db.rpc("srv_queue_read", {
        p_queue: queue,
        p_vt: vt,
        p_qty: qty,
      });
      if (error) throw new Error(`queue read failed: ${error.message}`);
      // pgmq.message_record; the generated types don't know the composite.
      return (
        (data ?? []) as { msg_id: number; read_ct: number; message: unknown }[]
      ).map((m) => ({
        msgId: m.msg_id,
        readCt: m.read_ct,
        message: m.message,
      }));
    },
    async send(queue, message) {
      const { error } = await db.rpc("srv_queue_send", {
        p_queue: queue,
        p_message: message as never,
      });
      if (error) throw new Error(`queue send failed: ${error.message}`);
    },
    async archive(queue, msgId) {
      const { error } = await db.rpc("srv_queue_archive", {
        p_queue: queue,
        p_msg_id: msgId,
      });
      if (error) throw new Error(`queue archive failed: ${error.message}`);
    },
  };
}

export type DrainResult = {
  handled: number;
  skipped: number;
  failed: number;
  deadLettered: number;
};
export type HandlerOutcome = "handled" | "skipped";

/** Drains one batch. Handlers must be idempotent: a message can be seen more than once. */
export async function drainQueue(
  queue: QueueStore,
  name: string,
  handle: (message: unknown) => Promise<HandlerOutcome>,
  opts: {
    batch?: number;
    visibilityS?: number;
    maxReads?: number;
    onError?: (e: unknown, m: QueueMessage) => void;
  } = {},
): Promise<DrainResult> {
  const out: DrainResult = {
    handled: 0,
    skipped: 0,
    failed: 0,
    deadLettered: 0,
  };
  const messages = await queue.read(
    name,
    opts.visibilityS ?? 60,
    opts.batch ?? 10,
  );
  for (const m of messages) {
    if (m.readCt > (opts.maxReads ?? 5)) {
      await queue.send(`${name}_dlq`, {
        original: m.message,
        msgId: m.msgId,
        readCt: m.readCt,
      });
      await queue.archive(name, m.msgId);
      out.deadLettered++;
      continue;
    }
    try {
      out[await handle(m.message)]++;
      await queue.archive(name, m.msgId);
    } catch (e) {
      out.failed++;
      opts.onError?.(e, m);
    }
  }
  return out;
}

export type OfferRefreshDeps = {
  db: Db;
  store: EvidenceStore;
  packs: readonly Pack[];
  greathub: ReturnType<typeof createGreatHubAdapter> | null;
};

/**
 * Refreshes one offer from the source that is authoritative for it. Only
 * GreatHub offers have a checkout to ask; reference offers (UPCitemdb) are
 * history and hand-off offers (Shopify) are re-read on view instead.
 */
export async function refreshOffer(
  deps: OfferRefreshDeps,
  offerId: string,
): Promise<HandlerOutcome> {
  const { data: offer, error } = await deps.db
    .from("offers")
    .select(
      "id, source, product_id, reference_only, products(external_id, roles)",
    )
    .eq("id", offerId)
    .maybeSingle();
  if (error) throw new Error(`offer read failed: ${error.message}`);
  if (
    !offer ||
    offer.reference_only ||
    offer.source !== "greathub" ||
    !deps.greathub
  )
    return "skipped";
  const sku = offer.products?.external_id;
  if (!sku) return "skipped";
  const read = await deps.greathub.refreshOffer(sku);
  if (!read.line) throw new Error(`GreatHub priced no line for ${sku}`);
  await applyCheckoutOffer(deps.db, offer.id, read.line.offer);
  await writeClaims(
    deps.store,
    read.line.claims.map((c) => ({ ...c, offerKey: offer.id })),
    {
      productId: offer.product_id,
      offerIds: { [offer.id]: offer.id },
    },
    read.source,
    deps.packs,
  );
  return "handled";
}

/** The `q_fact_refresh` handler: messages are `{ offerId }` (0010_jobs.sql). */
export function factRefreshHandler(deps: OfferRefreshDeps) {
  return async (message: unknown): Promise<HandlerOutcome> => {
    const offerId = (message as { offerId?: unknown } | null)?.offerId;
    if (typeof offerId !== "string" || !/^[0-9a-f-]{36}$/i.test(offerId))
      return "skipped";
    return refreshOffer(deps, offerId);
  };
}
