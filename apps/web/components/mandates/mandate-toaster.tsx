"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { useSession } from "../session-provider";

type MandateEvent = {
  mandateId: string;
  planId: string;
  status: string;
  outcome: { status?: string } | null;
};

const MESSAGES: Record<string, (e: MandateEvent) => string | null> = {
  fired_blocked: (e) =>
    e.outcome?.status === "paused"
      ? "Your mandate fired. Purchase paused: no payment was made."
      : "Your mandate fired but stopped before payment. No payment was made.",
  fired_executed: (e) =>
    e.outcome?.status === "paid"
      ? "Your mandate fired and the purchase was paid within your limits."
      : "Your mandate fired. The card was declined.",
  expired: () => "A standing mandate expired without firing.",
};

/**
 * T14.5: mandate outcomes arrive on the private `user:{id}` topic
 * (0015_mandates.sql), so the user hears about them on any page.
 */
export function MandateToaster() {
  const { user } = useSession();
  const [toasts, setToasts] = useState<(MandateEvent & { text: string })[]>([]);
  useEffect(() => {
    const client = createClient();
    if (!client || !user) return;
    const channel = client
      .channel(`user:${user.id}`, { config: { private: true } })
      .on("broadcast", { event: "mandate" }, ({ payload }) => {
        const e = payload as MandateEvent;
        const text = MESSAGES[e.status]?.(e);
        if (text)
          setToasts((t) => [
            ...t.filter((x) => x.mandateId !== e.mandateId),
            { ...e, text },
          ]);
      });
    void client.realtime
      .setAuth()
      .then(() => channel.subscribe())
      .catch(() => {});
    return () => {
      void client.removeChannel(channel);
    };
  }, [user]);

  return (
    <div
      aria-live="assertive"
      className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col items-end gap-2 sm:left-auto sm:w-[380px]"
    >
      {toasts.map((t) => (
        <div
          key={t.mandateId}
          role="status"
          className="pointer-events-auto w-full rounded-card border border-graphite bg-paper-raised p-4 shadow-primary"
        >
          <p className="font-semibold">{t.text}</p>
          <div className="mt-2 flex gap-4 text-small">
            <Link
              href={`/plans/${t.planId}/checkout`}
              className="underline underline-offset-4"
            >
              Open checkout
            </Link>
            <Link href="/mandates" className="underline underline-offset-4">
              All mandates
            </Link>
            <button
              type="button"
              className="ml-auto text-muted underline underline-offset-4"
              onClick={() =>
                setToasts((all) =>
                  all.filter((x) => x.mandateId !== t.mandateId),
                )
              }
            >
              Dismiss
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
