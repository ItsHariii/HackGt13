"use client";
import { useActionState } from "react";
import { primary } from "@/components/states/edge-states";
import { type BuyState, buyFromStore } from "./actions";

const input =
  "h-10 rounded-card border border-rule bg-paper-sheet px-2.5 text-graphite";

/**
 * A real Shopify product, bought on its own store (TASKS T13.10): Cartel
 * drafts and proves the contract; after you sign, it hands you the store's
 * checkout. Cartel never pays a Shopify store itself.
 */
export function BuyFromStore({
  offers,
}: {
  offers: { sku: string; label: string; priceMinor: number | null }[];
}) {
  const [state, run, pending] = useActionState<BuyState, FormData>(
    buyFromStore,
    { error: null },
  );
  const first = offers[0];
  if (!first) return null;
  const suggested =
    first.priceMinor === null
      ? ""
      : String(Math.ceil((first.priceMinor * 1.2) / 100));
  return (
    <form
      action={run}
      aria-labelledby="buy-store"
      className="flex flex-col gap-3 rounded-card border border-graphite bg-paper-raised p-4"
    >
      <h2 id="buy-store" className="font-semibold font-serif text-h4">
        Buy from this store
      </h2>
      <p className="text-graphite-2 text-small">
        Cartel opens this store's checkout, proves the total against your
        maximum and drafts a contract for you to sign. Then it hands you the
        store's checkout; you pay the store directly.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-small sm:col-span-3">
          Item
          <select name="sku" defaultValue={first.sku} className={input}>
            {offers.map((o) => (
              <option key={o.sku} value={o.sku}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-small">
          Quantity
          <input
            name="qty"
            type="number"
            min={1}
            max={20}
            defaultValue={1}
            required
            className={input}
          />
        </label>
        <label className="flex flex-col gap-1 text-small">
          Maximum total (USD)
          <input
            name="max"
            inputMode="decimal"
            defaultValue={suggested}
            required
            className={input}
          />
        </label>
        <label className="flex flex-col gap-1 text-small">
          May change on its own
          <select name="preset" defaultValue="strict" className={input}>
            <option value="strict">Nothing (strict)</option>
            <option value="balanced">Up to 2% or $5</option>
            <option value="flexible">Up to 5% or $20</option>
          </select>
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className={`${primary} disabled:cursor-wait disabled:opacity-60`}
        >
          {pending ? "Checking the store's checkout…" : "Draft the contract"}
        </button>
        <p aria-live="polite" className="text-small">
          {state.error && (
            <span role="alert" className="text-red-pen">
              {state.error}
            </span>
          )}
        </p>
      </div>
    </form>
  );
}
