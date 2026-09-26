"use client";
import { useEffect, useRef, useState } from "react";
import { useSession } from "@/components/session-provider";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/browser";

type EventRow = { id: string; plan_id: string; created_at: string };
type Received = EventRow & {
  latency?: number;
  transport: "broadcast" | "poll";
};
export function RealtimeSpike() {
  const session = useSession();
  const [planId, setPlanId] = useState<string | null>(null);
  const [transport, setTransport] = useState<
    "idle" | "connecting" | "broadcast" | "poll"
  >("idle");
  const [events, setEvents] = useState<Received[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const sent = useRef(new Map<string, number>());
  useEffect(() => {
    if (!planId) return;
    const client = createClient();
    if (!client) return;
    let active = true;
    let polling: ReturnType<typeof setInterval> | undefined;
    const seen = new Set<string>();
    const receive = (row: EventRow, via: "broadcast" | "poll") => {
      if (!active || row.plan_id !== planId || seen.has(row.id)) return;
      seen.add(row.id);
      const started = sent.current.get(row.id);
      const latency =
        started === undefined
          ? {}
          : { latency: Math.round(performance.now() - started) };
      sent.current.delete(row.id);
      setEvents((previous) =>
        [{ ...row, ...latency, transport: via }, ...previous].slice(0, 8),
      );
    };
    const poll = async () => {
      const { data, error: failure } = await client
        .from("foundation_events")
        .select("id,plan_id,created_at")
        .eq("plan_id", planId)
        .order("created_at", { ascending: false })
        .limit(8);
      if (!active) return;
      if (failure) {
        setError(
          "Could not read events. Check the migration and owner policies.",
        );
        return;
      }
      for (const row of [...(data ?? [])].reverse()) receive(row, "poll");
    };
    const startPolling = () => {
      if (!active || polling) return;
      setTransport("poll");
      void poll();
      polling = setInterval(() => {
        void poll();
      }, 1000);
    };
    setTransport("connecting");
    const channel = client
      .channel(`plan:${planId}`, { config: { private: true } })
      .on("broadcast", { event: "insert" }, ({ payload }) =>
        receive(payload as EventRow, "broadcast"),
      );
    const timeout = setTimeout(startPolling, 5000);
    void client.realtime
      .setAuth()
      .then(() => {
        if (!active) return;
        channel.subscribe((status) => {
          if (!active) return;
          if (status === "SUBSCRIBED") {
            clearTimeout(timeout);
            if (polling) {
              clearInterval(polling);
              polling = undefined;
            }
            setTransport("broadcast");
          } else if (
            status === "CHANNEL_ERROR" ||
            status === "TIMED_OUT" ||
            status === "CLOSED"
          )
            startPolling();
        });
      })
      .catch(startPolling);
    return () => {
      active = false;
      clearTimeout(timeout);
      if (polling) clearInterval(polling);
      void client.removeChannel(channel);
    };
  }, [planId]);
  async function createPlan() {
    const client = createClient();
    if (!client) return;
    setBusy(true);
    setError(null);
    try {
      const { data, error: failure } = await client
        .from("foundation_plans")
        .insert({})
        .select("id")
        .single();
      if (failure) throw failure;
      setEvents([]);
      sent.current.clear();
      setPlanId(data.id);
    } catch {
      setError(
        "Could not create the test plan. Apply the foundation migration and enable anonymous sign-in.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function insertEvent() {
    const client = createClient();
    if (!client || !planId) return;
    const id = crypto.randomUUID();
    sent.current.set(id, performance.now());
    setBusy(true);
    setError(null);
    try {
      const { error: failure } = await client
        .from("foundation_events")
        .insert({ id, plan_id: planId });
      if (failure) throw failure;
    } catch {
      sent.current.delete(id);
      setError("Event insert failed. Check database permissions.");
    } finally {
      setBusy(false);
    }
  }
  async function clearPlan() {
    const client = createClient();
    if (!client || !planId) return;
    setBusy(true);
    setError(null);
    try {
      const { error: failure } = await client
        .from("foundation_plans")
        .delete()
        .eq("id", planId);
      if (failure) throw failure;
      setPlanId(null);
      setEvents([]);
      setTransport("idle");
      sent.current.clear();
    } catch {
      setError("Could not remove the test plan.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="lab-panel">
      <h2>Private Realtime spike</h2>
      <p className="lab-output">
        Session: {session.status}
        {session.user ? ` / ${session.user.id}` : ""}
        <br />
        Transport: {transport}
        {planId ? ` / plan:${planId}` : ""}
      </p>
      {session.status === "unconfigured" ? (
        <p>
          Add the Supabase URL and publishable key to{" "}
          <code>apps/web/.env.local</code>, then restart the app. This page
          needs the foundation migration.
        </p>
      ) : null}
      {session.status === "error" ? (
        <p role="alert">
          Anonymous sign-in failed. Check Supabase configuration and reload.
        </p>
      ) : null}
      <div className="lab-controls">
        <Button
          onClick={createPlan}
          disabled={session.status !== "ready" || busy || Boolean(planId)}
        >
          Create test plan
        </Button>
        <Button
          variant="outline"
          onClick={insertEvent}
          disabled={!planId || busy || transport === "connecting"}
        >
          Insert test event
        </Button>
        <Button variant="ghost" onClick={clearPlan} disabled={!planId || busy}>
          Remove test plan
        </Button>
      </div>
      {error ? <p role="alert">{error}</p> : null}
      <div aria-live="polite" className="lab-output">
        {events.length === 0 ? (
          <p>No events received yet.</p>
        ) : (
          <ul>
            {events.map((event) => (
              <li key={event.id}>
                {event.transport} ·{" "}
                {event.latency === undefined
                  ? "earlier event"
                  : `${event.latency} ms`}{" "}
                · {event.id}
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="text-sm">
        Target: under 500 ms via broadcast. If the channel cannot connect, this
        test falls back to a database read every second. Polling is labeled
        separately.
      </p>
    </section>
  );
}
