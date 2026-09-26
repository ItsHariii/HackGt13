import type { Value } from "@cartel/contracts";
import {
  addDays,
  definePack,
  isIsoDate,
  isQuantity,
  type Resolved,
} from "@cartel/proof-engine";

/*
 * Apparel (SDD §8.3, §16.1 "Wedding guest"): fit from garment measurements
 * against a garment the user owns (± tolerance; an estimate either way, and
 * explicitly assumed from a body chart); fiber constraints; final sale; return
 * fee; the exchange buffer (delivery + return transit + reship ≤ event).
 * Color is only ever what the seller says; fit and looks can't be checked.
 */

/** Typical chest ease between a body measurement and the garment that fits it. */
export const CHEST_EASE_IN = 2;
/** Assumed days for a return to reach the seller, and for the replacement to arrive. */
export const RETURN_TRANSIT_DAYS = 2;
export const RESHIP_DAYS = 3;

const GARMENT_ROLES = [
  "dress",
  "top",
  "bottom",
  "suit",
  "outerwear",
  "shoes",
  "accessory",
] as const;

function days(r: Resolved): number | null {
  return r.state !== "unknown" && isQuantity(r.value) && r.value.unit === "day"
    ? r.value.value
    : null;
}

export const apparel = definePack({
  id: "apparel",
  version: "1.0.0",
  title: "Apparel",
  fields: {
    "garment.chest": {
      kind: "length",
      label: "Garment chest",
      unit: "in",
      authority: ["manufacturer", "merchant"],
      freshness: "24h",
    },
    "garment.waist": {
      kind: "length",
      label: "Garment waist",
      unit: "in",
      authority: ["manufacturer", "merchant"],
      freshness: "24h",
    },
    "garment.hip": {
      kind: "length",
      label: "Garment hip",
      unit: "in",
      authority: ["manufacturer", "merchant"],
      freshness: "24h",
    },
    "garment.length": {
      kind: "length",
      label: "Garment length",
      unit: "in",
      authority: ["manufacturer", "merchant"],
      freshness: "24h",
    },
    "garment.body_chest": {
      kind: "length",
      label: "Size-chart chest",
      unit: "in",
      authority: ["manufacturer", "merchant"],
      freshness: "24h",
    },
    // Fit is a prediction whichever chart it comes from.
    "garment.fit_chest": {
      kind: "length",
      label: "Chest fit",
      unit: "in",
      maxState: "estimated",
    },
    "garment.fiber.*": {
      kind: "ratio",
      label: "Fiber content",
      unit: "pct",
      authority: ["manufacturer", "merchant"],
      freshness: "24h",
    },
    "garment.fibers": {
      kind: "list",
      label: "Fibers",
      authority: ["manufacturer", "merchant"],
      freshness: "24h",
    },
    "garment.color": {
      kind: "text",
      label: "Color",
      maxState: "source_stated",
      freshness: "24h",
    },
    "garment.size": {
      kind: "text",
      label: "Size",
      authority: ["merchant_checkout", "merchant"],
    },
    "garment.fit_looks": { kind: "subjective", label: "Fit and looks" },
    "shoes.heel_height": {
      kind: "length",
      label: "Heel height",
      unit: "in",
      authority: ["manufacturer", "merchant"],
    },
    "returns.transit_days": {
      kind: "duration",
      label: "Return transit",
      unit: "day",
      authority: ["merchant_checkout", "merchant"],
    },
    "returns.reship_days": {
      kind: "duration",
      label: "Replacement shipping",
      unit: "day",
      authority: ["merchant_checkout", "merchant"],
    },
    "basket.exchange_ready_by": {
      kind: "date",
      label: "Exchange buffer",
      maxState: "estimated",
    },
  },
  jsonLd: {
    "garment.chest": [
      "additionalProperty[name=Chest].value",
      "additionalProperty[name=Bust].value",
    ],
    "garment.waist": ["additionalProperty[name=Waist].value"],
    "garment.length": ["additionalProperty[name=Length].value"],
    "garment.fibers": ["material"],
    "garment.color": ["color"],
    "garment.size": ["size"],
  },
  roles: GARMENT_ROLES.map((role) => ({ role, label: role, required: false })),
  derive: [
    {
      id: "fit_from_chart",
      scope: "item",
      output: "garment.fit_chest",
      inputs: ["garment.chest", "garment.body_chest"],
      compute(item) {
        const garment = item.get("garment.chest");
        if (garment.state !== "unknown" && isQuantity(garment.value)) {
          return {
            value: garment.value,
            from: [garment],
            assumptions: ["garment_measurement_predicts_fit"],
          };
        }
        const body = item.get("garment.body_chest");
        if (
          body.state !== "unknown" &&
          isQuantity(body.value) &&
          body.value.unit === "in"
        ) {
          return {
            value: { value: body.value.value + CHEST_EASE_IN, unit: "in" },
            from: [body],
            assumptions: [`body_chart_plus_${CHEST_EASE_IN}in_ease`],
          };
        }
        return null;
      },
    },
    {
      id: "exchange_buffer",
      scope: "basket",
      output: "basket.exchange_ready_by",
      inputs: [
        "offer.delivery_by",
        "returns.transit_days",
        "returns.reship_days",
      ],
      compute(basket) {
        let latest: string | null = null;
        const from: Resolved[] = [];
        const assumptions = new Set<string>();
        for (const item of basket.items) {
          const delivery = item.get("offer.delivery_by");
          if (!isIsoDate(delivery.value) || delivery.state === "unknown")
            return null;
          from.push(delivery);
          const transit = item.get("returns.transit_days");
          const reship = item.get("returns.reship_days");
          let extra = 0;
          if (days(transit) !== null) {
            extra += days(transit) as number;
            from.push(transit);
          } else {
            extra += RETURN_TRANSIT_DAYS;
            assumptions.add(`return_transit_${RETURN_TRANSIT_DAYS}d`);
          }
          if (days(reship) !== null) {
            extra += days(reship) as number;
            from.push(reship);
          } else {
            extra += RESHIP_DAYS;
            assumptions.add(`reship_${RESHIP_DAYS}d`);
          }
          const ready = addDays(delivery.value, extra);
          if (!latest || ready > latest) latest = ready;
        }
        if (!latest) return null;
        return { value: latest as Value, from, assumptions: [...assumptions] };
      },
    },
  ],
  defaults: [
    {
      ruleId: "returnable",
      build: (p) => ({
        scope: "item",
        role: typeof p.role === "string" ? p.role : "dress",
        field: "offer.final_sale",
        op: "eq",
        target: false,
        importance: "hard",
        minStateToPass: "verified",
        materiality: "on_verdict_change",
      }),
    },
    {
      ruleId: "return_fee",
      build: (p) =>
        p.maxReturnFee === undefined
          ? null
          : {
              scope: "item",
              role: typeof p.role === "string" ? p.role : "dress",
              field: "offer.return_fee",
              op: "lte",
              target: p.maxReturnFee,
              importance: "hard",
              minStateToPass: "verified",
              materiality: "on_verdict_change",
            },
    },
    {
      ruleId: "exchange_buffer",
      build: (p) =>
        p.eventDate === undefined
          ? null
          : {
              scope: "basket",
              field: "basket.exchange_ready_by",
              op: "lte",
              target: p.eventDate,
              importance: "hard",
              minStateToPass: "estimated",
              materiality: "on_verdict_change",
            },
    },
    {
      ruleId: "fit_looks",
      build: (p) => ({
        scope: "item",
        role: typeof p.role === "string" ? p.role : "dress",
        field: "garment.fit_looks",
        op: "exists",
        target: true,
        importance: "hard",
        minStateToPass: "source_stated",
        materiality: "on_verdict_change",
      }),
    },
  ],
});
