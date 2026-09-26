"use client";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/browser";
import type { PlanEvents } from "./figure-events";

type Event = keyof PlanEvents;
type Listener = (payload: unknown) => void;

type Entry = {
  channel: RealtimeChannel;
  listeners: Map<Event, Set<Listener>>;
  refs: number;
};

const EVENTS: Event[] = [
  "proof_result",
  "consent_diff",
  "ledger_event",
  "contract_status",
];
const channels = new Map<string, Entry>();

/**
 * One private Realtime channel per plan (`plan:{id}`, SDD §19.3), shared by
 * every hook on the page. Returns an unsubscribe function; the channel
 * closes when its last listener leaves. Does nothing without Supabase.
 */
export function subscribePlan<E extends Event>(
  planId: string,
  event: E,
  listener: (payload: PlanEvents[E]) => void,
): () => void {
  const client = createClient();
  if (!client) return () => {};
  let entry = channels.get(planId);
  if (!entry) {
    const listeners = new Map<Event, Set<Listener>>();
    let channel = client.channel(`plan:${planId}`, {
      config: { private: true },
    });
    for (const name of EVENTS)
      channel = channel.on("broadcast", { event: name }, ({ payload }) => {
        for (const l of listeners.get(name) ?? []) l(payload);
      });
    const created: Entry = { channel, listeners, refs: 0 };
    entry = created;
    channels.set(planId, created);
    void client.realtime
      .setAuth()
      .then(() => created.channel.subscribe())
      .catch(() => {});
  }
  const set = entry.listeners.get(event) ?? new Set<Listener>();
  set.add(listener as Listener);
  entry.listeners.set(event, set);
  entry.refs += 1;
  const current = entry;
  return () => {
    set.delete(listener as Listener);
    current.refs -= 1;
    if (current.refs === 0) {
      channels.delete(planId);
      void client.removeChannel(current.channel);
    }
  };
}
