"use client";
import type { Unit } from "@cartel/contracts";
import { PACKS } from "@cartel/rule-packs";
import { useEffect, useId, useState } from "react";
import { CheckoutTierBadge } from "@/components/cartel/checkout-tier-badge";
import { EvidenceBadge } from "@/components/cartel/evidence-badge";
import {
  SpecReceiptRow,
  SpecReceiptTable,
} from "@/components/cartel/spec-receipt-row";
import { Mark } from "@/components/paper/mark";
import { fieldOptions, manualRule } from "@/lib/manual-rule";
import type { ProductView, SpecView } from "@/lib/product-view";
import { COMPARE_MAX, trays, useTrays } from "@/lib/tray-store";
import { ruleText } from "@/lib/workspace";

const LOWER_IS_BETTER = new Set(["length", "mass", "volume"]);

/** Offers with a radio each, Add to plan (role picker) and Compare (TASKS T11.17). */
export function OfferPicker({
  view,
  pass,
  fail,
}: {
  view: ProductView;
  pass: number;
  fail: number;
}) {
  const id = useId();
  const t = useTrays();
  const buyable = view.offers.filter((o) => !o.referenceOnly);
  const [offerId, setOfferId] = useState(
    buyable[0]?.id ?? view.offers[0]?.id ?? "",
  );
  const [role, setRole] = useState(view.roles[0] ?? "item");
  const [status, setStatus] = useState("");
  const offer = view.offers.find((o) => o.id === offerId);
  const compared = t.compare.some((c) => c.id === view.id);

  const firstPrice = offer?.price ?? "";
  // biome-ignore lint/correctness/useExhaustiveDependencies: record once per product, not per offer change
  useEffect(() => {
    trays.viewed({ id: view.id, name: view.title, price: firstPrice });
  }, [view.id]);

  return (
    <div className="flex flex-col gap-4">
      <fieldset className="overflow-hidden rounded-card border border-rule bg-paper-raised">
        <legend className="sr-only">Offers</legend>
        <div
          aria-hidden="true"
          className="hidden grid-cols-[28px_minmax(0,1.3fr)_92px_minmax(0,1fr)_auto] items-center gap-3.5 border-rule border-b bg-[#f6f1e4] px-[18px] py-2.5 font-semibold text-[12px] text-muted uppercase tracking-[0.08em] sm:grid dark:bg-paper-shade"
        >
          <span />
          <span>Offers</span>
          <span className="text-right">Price</span>
          <span>Availability</span>
          <span>Checkout</span>
        </div>
        {view.offers.length === 0 && (
          <p className="px-[18px] py-4 text-muted text-small">
            No store lists a price for this product.
          </p>
        )}
        {view.offers.map((o) => (
          <label
            key={o.id}
            className="grid cursor-pointer grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-x-3.5 gap-y-2 border-rule-soft border-b px-[18px] py-4 last:border-b-0 has-[:checked]:bg-paper-sheet has-[:checked]:shadow-[inset_3px_0_0_var(--color-graphite)] sm:grid-cols-[28px_minmax(0,1.3fr)_92px_minmax(0,1fr)_auto]"
          >
            <input
              type="radio"
              name={`${id}-offer`}
              value={o.id}
              checked={offerId === o.id}
              disabled={o.referenceOnly}
              onChange={() => setOfferId(o.id)}
              className="size-5 accent-graphite"
            />
            <span className="font-semibold text-[15px]">{o.merchant}</span>
            <span className="num text-right font-medium text-[17px] text-ink sm:order-none">
              {o.price ?? "—"}
            </span>
            <span className="col-start-2 flex min-w-0 flex-col text-[14px] sm:col-start-auto">
              <span>
                {o.availability}
                {o.referenceOnly
                  ? " · reference only, never used for price rules"
                  : ""}
                {o.url && /^https?:\/\//.test(o.url) && (
                  <>
                    {" · "}
                    <a
                      href={o.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline underline-offset-2 hover:text-ink"
                    >
                      View the source listing
                      <span className="sr-only"> (opens in a new tab)</span>
                    </a>
                  </>
                )}
              </span>
            </span>
            <span className="col-start-2 sm:col-start-auto">
              <CheckoutTierBadge tier={o.tier} explain />
            </span>
          </label>
        ))}
      </fieldset>
      <div className="flex flex-wrap items-end gap-3">
        {view.roles.length > 1 && (
          <label className="flex flex-col gap-1 text-small">
            As
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="h-11 rounded-card border border-rule bg-paper-raised px-2.5"
            >
              {view.roles.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
        )}
        <button
          type="button"
          className="inline-flex h-[54px] items-center gap-2.5 rounded-card bg-graphite px-[30px] font-semibold text-[16px] text-paper-raised shadow-primary hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!offer || offer.referenceOnly}
          onClick={() => {
            if (!offer) return;
            trays.addItem({
              productId: view.id,
              title: view.title,
              role,
              price: offer.price ?? "—",
              priceMinor: offer.priceMinor,
              tier: offer.tier,
              pass,
              fail,
            });
            setStatus(`Added to your plan tray as the ${role}.`);
          }}
        >
          Add to plan
          {offer?.price && (
            <span className="num font-medium opacity-80">{offer.price}</span>
          )}
        </button>
        <button
          type="button"
          className="inline-flex h-[54px] items-center rounded-card border border-graphite bg-paper-raised px-6 font-medium text-[16px] text-graphite hover:bg-paper aria-pressed:bg-paper-shade"
          aria-pressed={compared}
          onClick={() => {
            const ok = trays.toggleCompare(
              { id: view.id, name: view.title, price: offer?.price ?? "—" },
              !compared,
            );
            setStatus(
              ok
                ? compared
                  ? "Removed from compare."
                  : "Added to compare."
                : `Compare holds up to ${COMPARE_MAX} products.`,
            );
          }}
        >
          {compared ? "In compare" : "Compare"}
        </button>
      </div>
      <p aria-live="polite" className="text-muted text-small">
        {status}
      </p>
    </div>
  );
}

/** "Specs with receipts", each row able to become a rule; disagreements side by side. */
export function SpecTable({ view }: { view: ProductView }) {
  const [status, setStatus] = useState("");
  const packs = Object.values(PACKS).filter((p) =>
    p.roles.some((r) => view.roles.includes(r.role)),
  );
  const options = fieldOptions(packs);
  const makeRule = (s: SpecView) => {
    const field = options.find((o) => o.field === s.field);
    if (!field || !s.input) return null;
    return () => {
      const op =
        field.kind === "boolean" || field.kind === "enum"
          ? "eq"
          : LOWER_IS_BETTER.has(field.kind)
            ? "lte"
            : "gte";
      const r = manualRule({
        id: `u_${s.field.replace(/[^a-z0-9]+/g, "_")}`,
        field,
        op,
        value: s.input?.value ?? "",
        unit: s.input?.unit as Unit | undefined,
        importance: "hard",
      });
      if (!r.ok) {
        setStatus(r.error);
        return;
      }
      const text = ruleText(r.requirement, packs);
      const added = trays.addRule({
        id: r.requirement.id,
        text,
        requirement: r.requirement,
      });
      setStatus(
        added
          ? `Rule added: ${text} (You chose).`
          : `${text} is already in your tray.`,
      );
    };
  };
  const disagree = view.specs.filter((s) => s.claims);
  return (
    <div className="flex flex-col gap-4">
      <SpecReceiptTable caption="Specs with receipts — who says so, and when">
        {view.specs.map((s) => (
          <SpecReceiptRow
            key={s.field}
            receipt={{
              spec: s.label,
              value: s.value,
              evidence: s.level,
              source: s.source,
              checked: s.checked,
            }}
            onMakeRule={makeRule(s) ?? undefined}
          />
        ))}
      </SpecReceiptTable>
      {disagree.map((s) => (
        <section
          key={s.field}
          aria-label={`Sources disagree: ${s.label}`}
          className="sheet flex flex-col gap-3 border-red-pen p-4"
        >
          <p className="font-semibold text-red-pen text-ui">
            <span aria-hidden="true">≠ </span>Sources disagree · {s.label}
          </p>
          <Mark type="bracket">
            <span className="grid gap-2 sm:grid-cols-2">
              {s.claims?.map((c) => (
                <span
                  key={`${c.source}-${c.value}`}
                  className="flex flex-col gap-1 rounded-card border border-rule p-3"
                >
                  <span className="num font-semibold text-[17px]">
                    {c.value}
                  </span>
                  <EvidenceBadge
                    level={c.level}
                    detail={`${c.source} · ${c.checked}`}
                  />
                </span>
              ))}
            </span>
          </Mark>
          <p className="text-small">
            A rule on {s.label.toLowerCase()} is marked ? Can't check until one
            source is confirmed.
          </p>
        </section>
      ))}
      <p className="text-muted text-small">
        Evidence refreshes when you add the product to a plan and again at
        checkout.
      </p>
      <p aria-live="polite" className="text-small">
        {status}
      </p>
    </div>
  );
}
