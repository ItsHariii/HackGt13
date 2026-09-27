"use client";
import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";

type Instrument = {
  id: string;
  rail: string;
  brand: string | null;
  last4: string | null;
  exp_month: number | null;
  exp_year: number | null;
};
type Config = {
  instruments: Instrument[];
  rail: string;
  label: string;
  apiLoginId?: string;
  clientKey?: string;
};
type Microform = {
  createField: (
    type: string,
    opts: object,
  ) => { load: (selector: string) => void; unload: () => void };
  createToken: (
    opts: object,
    done: (error: unknown, token?: string) => void,
  ) => void;
};
declare global {
  interface Window {
    Flex?: new (context: string) => { microform: (opts: object) => Microform };
    cartelAcceptResponse?: (response: {
      opaqueData?: { dataDescriptor: string; dataValue: string };
    }) => void;
  }
}
const libraries = new Map<string, Promise<void>>();
/**
 * Loads the Microform library once per URL. next/script is not used here: it
 * caches a failed load and never calls onReady for it again, so a retry after
 * a blocked or failed script hung on "Opening secure card fields…".
 */
function loadLibrary(src: string, integrity: string): Promise<void> {
  const cached = libraries.get(src);
  if (cached) return cached;
  const loading = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.integrity = integrity;
    script.crossOrigin = "anonymous";
    script.onload = () => resolve();
    script.onerror = () => {
      script.remove();
      libraries.delete(src);
      reject(new Error("microform_unavailable"));
    };
    document.body.appendChild(script);
  });
  libraries.set(src, loading);
  return loading;
}
export function PaymentSettings({
  returnTo = null,
}: {
  /** A validated plan checkout path to go back to once a card is saved. */
  returnTo?: string | null;
}) {
  const [config, setConfig] = useState<Config | null>(null);
  const [context, setContext] = useState<{
    captureContext: string;
    clientLibrary: string;
    clientLibraryIntegrity: string;
  } | null>(null);
  const [message, setMessage] = useState("Loading your payment methods…");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const microform = useRef<Microform | null>(null);
  const fields = useRef<{ unload: () => void }[]>([]);
  const load = useCallback(async () => {
    const response = await fetch("/api/payments/instruments");
    if (!response.ok)
      throw new Error(
        "Sign in to manage your payment methods. If you are signed in, payment settings may be unavailable.",
      );
    const data = (await response.json()) as Config;
    setConfig(data);
    setMessage("");
  }, []);
  useEffect(() => {
    load().catch((e) => setMessage(e.message));
    return () => {
      for (const field of fields.current) field.unload();
    };
  }, [load]);
  async function enroll(body: object) {
    setBusy(true);
    setMessage("Saving your payment method…");
    try {
      const response = await fetch("/api/payments/instruments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok)
        throw new Error(
          "The payment method could not be saved. Open a new card form and try again.",
        );
      await load();
      if (returnTo) {
        setMessage("Payment method saved. Returning to checkout…");
        window.location.assign(returnTo);
        return;
      }
      setMessage("Payment method saved.");
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    window.cartelAcceptResponse = (response) => {
      if (response.opaqueData)
        void enroll({ rail: "authorize_net", opaqueData: response.opaqueData });
      else setMessage("Card entry was not completed. Try again.");
    };
    return () => {
      delete window.cartelAcceptResponse;
    };
  });
  async function openCard() {
    setBusy(true);
    setMessage("Opening secure card fields…");
    try {
      for (const field of fields.current) field.unload();
      fields.current = [];
      microform.current = null;
      setReady(false);
      setContext(null);
      const response = await fetch("/api/payments/capture-context", {
        method: "POST",
      });
      if (!response.ok)
        throw new Error(
          "Secure card entry is unavailable. Please try again later.",
        );
      setContext(await response.json());
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (!context) return;
    let current = true;
    const fail = () =>
      setMessage(
        "Secure card fields could not load. Reload the page and try again.",
      );
    loadLibrary(context.clientLibrary, context.clientLibraryIntegrity)
      .then(() => {
        if (!current || microform.current) return;
        if (!window.Flex) return fail();
        const form = new window.Flex(context.captureContext).microform({
          styles: { input: { "font-size": "16px", color: "#2b2a28" } },
        });
        const number = form.createField("number", {
          placeholder: "Card number",
        });
        const security = form.createField("securityCode", {
          placeholder: "Security code",
        });
        number.load("#card-number");
        security.load("#security-code");
        fields.current = [number, security];
        microform.current = form;
        setReady(true);
        setMessage("");
      })
      .catch(() => {
        if (current) fail();
      });
    return () => {
      current = false;
    };
  }, [context]);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!microform.current || busy) return;
    setBusy(true);
    const data = new FormData(event.currentTarget);
    const billTo = Object.fromEntries(
      [
        "firstName",
        "lastName",
        "address1",
        "locality",
        "administrativeArea",
        "postalCode",
        "country",
        "email",
      ].map((key) => [key, data.get(key)]),
    );
    microform.current.createToken(
      {
        expirationMonth: data.get("expirationMonth"),
        expirationYear: data.get("expirationYear"),
      },
      (error, token) => {
        if (error || !token) {
          setBusy(false);
          setMessage(
            "Check the card fields and expiration date, then try again.",
          );
          return;
        }
        void enroll({ rail: "visa_acceptance", transientToken: token, billTo });
      },
    );
  }
  const inputClass =
    "mt-2 w-full rounded border border-border bg-white p-3 text-[#2b2a28] focus:outline-2 focus:outline-ink";
  return (
    <div className="mx-auto max-w-3xl px-6 py-14">
      {returnTo && (
        <a href={returnTo} className="mb-6 inline-block text-ink underline">
          ← Back to checkout
        </a>
      )}
      <p className="font-mono text-xs uppercase tracking-widest text-muted">
        Settings / Payment
      </p>
      <h1 className="mt-4 font-serif text-5xl tracking-tight">
        A card on file.
        <br />
        Your rules in charge.
      </h1>
      <p className="mt-5 max-w-xl text-muted">
        Saving a card does not approve a purchase. Each payment still needs your
        signed contract and a fresh check.
      </p>
      {config && (
        <p
          className={`mt-8 border p-4 ${config.rail === "simulated" ? "border-red-pen bg-red-pen-wash text-[#9b2924]" : "border-border"}`}
        >
          {config.label}
        </p>
      )}
      <section
        aria-label="Saved payment methods"
        className="my-8 border-y border-border"
      >
        {config?.instruments.length === 0 && (
          <p className="py-6 text-muted">No payment method saved yet.</p>
        )}
        {config?.instruments.map((card) => (
          <div
            key={card.id}
            className="flex flex-wrap justify-between gap-2 border-b border-border py-5 last:border-0"
          >
            <span>
              {card.brand ?? "Card"}{" "}
              {card.last4 ? `•••• ${card.last4}` : "— no card charged"}
            </span>
            <span className="font-mono text-sm">
              {card.exp_month && card.exp_year
                ? `${card.exp_month}/${card.exp_year}`
                : card.rail}
            </span>
          </div>
        ))}
      </section>
      {config?.rail === "simulated" && (
        <button
          type="button"
          disabled={busy}
          className="bg-ink px-5 py-3 text-paper disabled:opacity-50"
          onClick={() => void enroll({ rail: "simulated" })}
        >
          Add simulated method
        </button>
      )}
      {config?.rail === "visa_acceptance" && (
        <>
          <button
            type="button"
            disabled={busy}
            className="border border-ink px-5 py-3 text-ink disabled:opacity-50"
            onClick={() => void openCard()}
          >
            Open secure card form
          </button>
          {context && (
            <form
              className="mt-8 space-y-5 border border-border bg-paper-raised p-6"
              onSubmit={submit}
            >
              <p className="text-sm text-muted">
                Card number and security code go directly to Visa Acceptance.
              </p>
              <div>
                <p id="number-label">Card number</p>
                <fieldset
                  id="card-number"
                  aria-labelledby="number-label"
                  className={`${inputClass} h-12`}
                />
              </div>
              <div>
                <p id="security-label">Security code</p>
                <fieldset
                  id="security-code"
                  aria-labelledby="security-label"
                  className={`${inputClass} h-12`}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <label>
                  Expiry month
                  <input
                    name="expirationMonth"
                    placeholder="MM"
                    pattern="0[1-9]|1[0-2]"
                    required
                    className={inputClass}
                  />
                </label>
                <label>
                  Expiry year
                  <input
                    name="expirationYear"
                    placeholder="YYYY"
                    pattern="20[0-9]{2}"
                    required
                    className={inputClass}
                  />
                </label>
              </div>
              <fieldset className="grid gap-4 sm:grid-cols-2">
                <legend className="mb-4 font-serif text-2xl">
                  Billing address
                </legend>
                {[
                  ["firstName", "First name"],
                  ["lastName", "Last name"],
                  ["address1", "Street address"],
                  ["locality", "City"],
                  ["administrativeArea", "State / province"],
                  ["postalCode", "Postal code"],
                  ["country", "Country code (US)"],
                  ["email", "Email"],
                ].map(([name, label]) => (
                  <label key={name}>
                    {label}
                    <input
                      name={name}
                      required
                      type={name === "email" ? "email" : "text"}
                      defaultValue={name === "country" ? "US" : undefined}
                      maxLength={name === "country" ? 2 : 100}
                      className={inputClass}
                    />
                  </label>
                ))}
              </fieldset>
              <button
                type="submit"
                disabled={busy || !ready}
                className="bg-ink px-5 py-3 text-paper disabled:opacity-50"
              >
                {busy ? "Saving…" : "Save payment method"}
              </button>
            </form>
          )}
        </>
      )}
      {config?.rail === "authorize_net" &&
        config.apiLoginId &&
        config.clientKey && (
          <>
            <Script src="https://jstest.authorize.net/v3/AcceptUI.js" />
            <button
              type="button"
              className="AcceptUI border border-ink px-5 py-3 text-ink"
              data-apiLoginID={config.apiLoginId}
              data-clientKey={config.clientKey}
              data-acceptUIFormBtnTxt="Save card"
              data-acceptUIFormHeaderTxt="Payment method"
              data-responseHandler="cartelAcceptResponse"
              disabled={busy}
            >
              Open secure card form
            </button>
          </>
        )}
      {config?.rail === "vic" && (
        <p>Visa Intelligent Commerce enrollment is not available yet.</p>
      )}
      <p role="status" aria-live="polite" className="mt-6 min-h-6 text-sm">
        {message}
      </p>
      {!config && (
        <button
          type="button"
          className="underline"
          onClick={() => void load().catch((e) => setMessage(e.message))}
        >
          Retry
        </button>
      )}
    </div>
  );
}
