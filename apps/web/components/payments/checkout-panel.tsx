"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  type GuardStep,
  GuardStepper,
} from "@/components/cartel/guard-stepper";
import { GuardStepIn, HighFive } from "@/components/doodle/moments";
import {
  type MerchantStatus,
  MerchantStatusTable,
} from "./merchant-status-table";

type Phase = "idle" | "busy" | "paid" | "paused" | "declined" | "uncertain";
const STEPS = [
  "Refresh cart",
  "Re-fetch specs",
  "Re-prove",
  "Diff",
  "Guard",
  "Pay",
  "Order",
] as const;
/** The guard's steps for an outcome; the server answers once, so no step is invented. */
function stepsFor(phase: Phase): GuardStep[] {
  const stop =
    phase === "paused"
      ? 4
      : phase === "declined" || phase === "uncertain"
        ? 5
        : phase === "busy"
          ? 0
          : 7;
  return STEPS.map((label, i) => ({
    label,
    state:
      i < stop
        ? "done"
        : i === stop
          ? phase === "busy" || phase === "uncertain"
            ? "current"
            : "failed"
          : "pending",
    meta:
      i === stop
        ? phase === "busy"
          ? "Checking…"
          : phase === "paused"
            ? "Blocked · no payment"
            : phase === "declined"
              ? "Declined"
              : phase === "uncertain"
                ? "Outcome unresolved"
                : undefined
        : undefined,
  }));
}
type State = {
  merchants: MerchantStatus[];
  instruments: { id: string; brand: string | null; last4: string | null }[];
  label: string;
};
export function CheckoutPanel({ planId }: { planId: string }) {
  const [data, setData] = useState<State | null>(null);
  const [instrumentId, setInstrument] = useState("");
  const [message, setMessage] = useState("Loading checkout…");
  const [busy, setBusy] = useState(false);
  const [paused, setPaused] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [handoffUrl, setHandoffUrl] = useState<string | null>(null);
  const keys = useRef(new Map<string, string>());
  const [uncertain, setUncertain] = useState(new Set<string>());
  const load = useCallback(async () => {
    const res = await fetch(`/api/plans/${planId}/payments`);
    if (!res.ok)
      throw new Error(
        "Checkout is unavailable. Sign in and open a saved plan with a signed contract.",
      );
    const state = (await res.json()) as State;
    setData(state);
    setInstrument((old) => old || state.instruments[0]?.id || "");
  }, [planId]);
  useEffect(() => {
    load()
      .then(() => setMessage(""))
      .catch((e) => setMessage(e.message));
  }, [load]);
  async function execute(merchant: MerchantStatus) {
    if (busy) return;
    setBusy(true);
    setPaused(false);
    setPhase("busy");
    setMessage("Refreshing the checkout and checking your signed rules…");
    const key = keys.current.get(merchant.versionId) ?? crypto.randomUUID();
    keys.current.set(merchant.versionId, key);
    try {
      const res = await fetch(`/api/checkout/${merchant.versionId}/execute`, {
        method: "POST",
        headers: { "content-type": "application/json", "Idempotency-Key": key },
        body: JSON.stringify({ instrumentId }),
      });
      const result = await res.json();
      setPhase(
        result.status === "paid"
          ? "paid"
          : result.status === "declined"
            ? "declined"
            : result.status === "paused"
              ? "paused"
              : "uncertain",
      );
      if (result.status === "paid") {
        setMessage("Payment authorized. Your order is recorded.");
        setUncertain((old) => {
          const next = new Set(old);
          next.delete(merchant.versionId);
          return next;
        });
      } else if (result.status === "declined") {
        keys.current.delete(merchant.versionId);
        setMessage(
          "Payment declined. Check your payment method. Select Retry payment when you are ready; this starts a new attempt.",
        );
      } else if (result.status === "paused") {
        setPaused(true);
        setMessage(
          `PURCHASE PAUSED · NO PAYMENT WAS MADE. The checkout requires a revised contract. Diff: ${result.diffId}`,
        );
      } else {
        setUncertain((old) => new Set(old).add(merchant.versionId));
        setMessage(
          "The payment outcome is unresolved. Check status before trying anything else. No automatic retry will occur.",
        );
      }
      await load();
    } catch {
      setPhase("uncertain");
      setUncertain((old) => new Set(old).add(merchant.versionId));
      setMessage(
        "The connection was interrupted. Check status to reconcile the existing attempt.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function handoff(merchant: MerchantStatus) {
    setBusy(true);
    setPaused(false);
    setHandoffUrl(null);
    setMessage("Re-checking the store checkout…");
    try {
      const res = await fetch(`/api/handoff/${merchant.versionId}`, {
        method: "POST",
      });
      const result = await res.json();
      if (result.status === "handed_off") {
        setHandoffUrl(result.url);
        setMessage(
          `Re-checked at ${new Date(result.checkedAt).toLocaleTimeString()}. After this, the store's checkout decides.`,
        );
      } else if (result.status === "paused") {
        setPaused(true);
        setMessage(
          "PURCHASE PAUSED · NO PAYMENT WAS MADE. Review the revised checkout before continuing.",
        );
      } else
        setMessage(
          "The store checkout could not be checked. Please try again later.",
        );
    } catch {
      setMessage(
        "The store checkout is unavailable. No Cartel payment was attempted.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="mx-auto max-w-3xl px-6 py-14">
      <p className="font-mono text-xs uppercase tracking-widest text-muted">
        Contract → checkout
      </p>
      <h1 className="mt-4 font-serif text-5xl">One last check.</h1>
      <p className="mt-5 text-muted">
        Cartel refreshes the cart and product specs, checks every signed rule,
        and compares changes before payment.
      </p>
      {data && (
        <>
          <p className="mt-8 border border-ink p-4">{data.label}</p>
          <MerchantStatusTable merchants={data.merchants} />
          {data.merchants.length === 0 && (
            <p>No contract is ready for checkout yet.</p>
          )}
          {data.instruments.length === 0 ? (
            <Link href="/settings/payment" className="text-ink underline">
              Add a payment method
            </Link>
          ) : (
            <label className="block">
              Payment method
              <select
                disabled={busy || uncertain.size > 0}
                value={instrumentId}
                onChange={(e) => setInstrument(e.target.value)}
                className="my-3 block w-full border border-border bg-paper-raised p-3"
              >
                {data.instruments.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.brand ?? "Card"}{" "}
                    {i.last4 ? `•••• ${i.last4}` : "(simulated)"}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="mt-5 flex flex-wrap items-end gap-3">
            {data.merchants
              .filter((m) => m.handoff)
              .map((m) => (
                <button
                  key={`handoff-${m.merchant}`}
                  type="button"
                  disabled={busy}
                  onClick={() => void handoff(m)}
                  className="border border-ink px-5 py-3 text-ink disabled:opacity-50"
                >
                  Re-check and hand off to {m.merchant}
                </button>
              ))}
            {data.merchants
              .filter((m) => m.executable && m.status !== "paid")
              .map((m) => (
                <button
                  key={m.merchant}
                  type="button"
                  disabled={busy || paused || !instrumentId}
                  onClick={() => void execute(m)}
                  className="bg-ink px-5 py-3 text-paper disabled:opacity-50"
                >
                  {busy
                    ? "Checking…"
                    : uncertain.has(m.versionId) ||
                        m.status === "reconcile_required"
                      ? "Check payment status"
                      : m.status === "failed"
                        ? "Retry payment"
                        : `Check and pay ${m.merchant}`}
                </button>
              ))}
            {/* Beside Pay, never on it (SDD §17.9). */}
            {phase === "paused" && <GuardStepIn h={88} />}
          </div>
          {phase === "paid" && (
            <div className="mt-6">
              <HighFive h={96} delay={300} />
            </div>
          )}
        </>
      )}
      {phase !== "idle" && (
        <div className="mt-8">
          <GuardStepper steps={stepsFor(phase)} label="Guard steps" />
        </div>
      )}
      <p
        aria-live={paused ? "assertive" : "polite"}
        role="status"
        className={`mt-8 border-l-2 pl-4 ${paused ? "border-red-pen text-red-pen" : "border-ink"}`}
      >
        {message}
      </p>
      {!data && (
        <button
          type="button"
          className="mt-4 text-ink underline"
          onClick={() =>
            void load()
              .then(() => setMessage(""))
              .catch((e) => setMessage(e.message))
          }
        >
          Retry loading
        </button>
      )}
      {handoffUrl && (
        <a
          href={handoffUrl}
          className="mt-5 inline-block border border-ink px-5 py-3 text-ink"
        >
          Continue at the store
        </a>
      )}
      <Link
        href={`/plans/${planId}`}
        className="mt-8 inline-block text-ink underline"
      >
        Back to plan
      </Link>
    </main>
  );
}
