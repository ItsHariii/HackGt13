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
import { Button } from "@/components/ui/button";
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
      <fieldset className="flex flex-col gap-2">
        <legend className="pb-2 font-semibold text-meta text-muted uppercase tracking-label">
          Offers
        </legend>
        {view.offers.length === 0 && (
          <p className="text-muted text-small">
            No store lists a price for this product.
          </p>
        )}
        {view.offers.map((o) => (
          <label
            key={o.id}
            className="sheet flex cursor-pointer flex-wrap items-center gap-x-4 gap-y-1 p-3 has-[:checked]:border-graphite"
          >
            <input
              type="radio"
              name={`${id}-offer`}
              value={o.id}
              checked={offerId === o.id}
              disabled={o.referenceOnly}
              onChange={() => setOfferId(o.id)}
              className="accent-ink"
            />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="font-semibold text-ui">{o.merchant}</span>
              <span className="text-muted text-small">
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
            <span className="num font-semibold text-[17px] text-ink">
              {o.price ?? "—"}
            </span>
            <CheckoutTierBadge tier={o.tier} explain />
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
        <Button
          type="button"
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
          Add to plan{offer?.price ? ` ${offer.price}` : ""}
        </Button>
        <Button
          type="button"
          variant="outline"
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
        </Button>
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
