// The Chaos Panel's mutation catalog and scenario scripts (SDD §16, T6.10).
// Shared by the panel UI and the API; the database applies them atomically.

import { z } from "zod";

export interface ParamSpec {
  key: string;
  label: string;
  kind: "money" | "text" | "integer" | "sku";
  required?: boolean;
  placeholder?: string;
}

export interface MutationSpec {
  id: string;
  label: string;
  description: string;
  /** Which proof it should trip in Cartel. */
  expect: string;
  params: ParamSpec[];
}

export const MUTATIONS: MutationSpec[] = [
  {
    id: "price_drop",
    label: "Price drop",
    description: "Lower the price on the same SKU.",
    expect: "Auto-accepted under Balanced; can fire a price mandate.",
    params: [
      { key: "priceMinor", label: "New price", kind: "money", required: true },
    ],
  },
  {
    id: "price_raise",
    label: "Price raise",
    description: "Raise the price on the same SKU.",
    expect: "Re-approval above the autonomy tolerance.",
    params: [
      { key: "priceMinor", label: "New price", kind: "money", required: true },
    ],
  },
  {
    id: "spec_edit",
    label: "Spec edit (same SKU)",
    description:
      "Rewrite one spec value on the listing without changing the SKU.",
    expect: "Re-proof fails the affected requirement and blocks.",
    params: [
      {
        key: "name",
        label: "Spec name",
        kind: "text",
        required: true,
        placeholder: "USB-C power delivery",
      },
      {
        key: "value",
        label: "New value",
        kind: "text",
        required: true,
        placeholder: "15 W",
      },
    ],
  },
  {
    id: "variant_swap",
    label: "Variant swap",
    description: "Keep the listing, ship a different item.",
    expect: "The shipped GTIN no longer matches the contract.",
    params: [
      { key: "toSku", label: "Ships as SKU", kind: "sku", required: true },
    ],
  },
  {
    id: "seller_rotation",
    label: "Seller rotation",
    description: "The same offer moves to a marketplace seller.",
    expect: "Re-approval: seller identity is material.",
    params: [],
  },
  {
    id: "final_sale_flip",
    label: "Final-sale flip",
    description: "Make the item final sale, optionally at a lower price.",
    expect: "Blocks any hard 'returnable' requirement.",
    params: [
      { key: "priceMinor", label: "New price (optional)", kind: "money" },
    ],
  },
  {
    id: "return_fee_added",
    label: "Return fee added",
    description: "Switch to 30-day returns with a $7.95 fee.",
    expect: "Terms change; re-approval under Strict.",
    params: [],
  },
  {
    id: "return_window_shortened",
    label: "Return window shortened",
    description: "Switch to 14-day returns.",
    expect: "Terms change; may break the exchange buffer.",
    params: [],
  },
  {
    id: "shipping_fee_added",
    label: "Shipping surcharge",
    description: "Add a handling surcharge for this item.",
    expect: "Total increase; auto or re-approval by tolerance.",
    params: [
      {
        key: "feeMinor",
        label: "Surcharge",
        kind: "money",
        placeholder: "9.95",
      },
    ],
  },
  {
    id: "delivery_slip",
    label: "Delivery slip",
    description: "Push the delivery window out.",
    expect: "Fails an arrive-by requirement.",
    params: [
      { key: "days", label: "Days later", kind: "integer", placeholder: "3" },
    ],
  },
  {
    id: "out_of_stock",
    label: "Out of stock",
    description: "Stock goes to zero.",
    expect: "Checkout reports out_of_stock; nothing is charged.",
    params: [],
  },
  {
    id: "pack_size_shrink",
    label: "Pack-size shrink",
    description: "Fewer units per pack at the same price.",
    expect: "Quantity requirement fails on the same SKU.",
    params: [{ key: "packSize", label: "New pack size", kind: "integer" }],
  },
  {
    id: "subscription_added",
    label: "Subscription added",
    description: "Turn a one-time purchase into a recurring one.",
    expect: "Recurring change is always material.",
    params: [
      {
        key: "every",
        label: "Every (ISO 8601)",
        kind: "text",
        placeholder: "P30D",
      },
      { key: "priceMinor", label: "Renewal price", kind: "money" },
    ],
  },
  {
    id: "listing_injection_text",
    label: "Injection text",
    description: "Add a prompt-injection note to the listing.",
    expect: "Quarantined; never becomes a fact.",
    params: [{ key: "text", label: "Text (optional)", kind: "text" }],
  },
  {
    id: "jsonld_conflict",
    label: "JSON-LD conflict",
    description: "The page's JSON-LD disagrees with the visible spec.",
    expect: "Shown as Sources disagree.",
    params: [
      {
        key: "name",
        label: "Spec name",
        kind: "text",
        required: true,
        placeholder: "USB-C power delivery",
      },
      {
        key: "value",
        label: "JSON-LD value",
        kind: "text",
        required: true,
        placeholder: "90 W",
      },
    ],
  },
  {
    id: "recall_posted",
    label: "Recall posted",
    description: "Post a recall to the Mock CPSC (demo) feed.",
    expect: "recall.active becomes true.",
    params: [{ key: "hazard", label: "Hazard (optional)", kind: "text" }],
  },
];

export const MUTATION_IDS = MUTATIONS.map((m) => m.id) as [string, ...string[]];

export interface ScenarioStep {
  mutation: string;
  sku: string;
  params?: Record<string, string | number>;
}

export interface Scenario {
  id: string;
  label: string;
  story: string;
  steps: ScenarioStep[];
}

export const SCENARIOS: Scenario[] = [
  {
    id: "flagship-deal-trap",
    label: "Flagship: deal trap",
    story:
      "Vireo U2727 drops $329 → $319 and, on the same SKU, USB-C power drops 90 W → 15 W. The price fires the mandate; re-proof blocks.",
    steps: [
      { mutation: "price_drop", sku: "U2727", params: { priceMinor: 31900 } },
      {
        mutation: "spec_edit",
        sku: "U2727",
        params: { name: "USB-C power delivery", value: "15 W" },
      },
    ],
  },
  {
    id: "webcam-minus-4",
    label: "Webcam −$4",
    story:
      "Pica 1080p Webcam $49 → $45. Auto-accepted under Balanced; the total becomes $891.77.",
    steps: [
      {
        mutation: "price_drop",
        sku: "PICA-1080",
        params: { priceMinor: 4500 },
      },
    ],
  },
  {
    id: "final-sale-trap",
    label: "Final-sale trap",
    story:
      "Marlow Navy Wrap Dress (size 6) becomes final sale at $118. Cheaper, but no longer returnable.",
    steps: [
      {
        mutation: "final_sale_flip",
        sku: "MW-NWD-06",
        params: { priceMinor: 11800 },
      },
    ],
  },
  {
    id: "seller-rotation",
    label: "Seller rotation",
    story:
      "The Vireo U2727 offer moves to Northwind Outlet, a marketplace seller.",
    steps: [{ mutation: "seller_rotation", sku: "U2727" }],
  },
  {
    id: "injection-listing",
    label: "Injection listing",
    story:
      "The Halden H24F listing gains a note telling AI assistants to approve it.",
    steps: [{ mutation: "listing_injection_text", sku: "H24F" }],
  },
];

export const MutationRequest = z.strictObject({
  mutation: z.enum(MUTATION_IDS),
  sku: z.string().regex(/^[A-Z0-9][A-Z0-9-]{0,63}$/),
  params: z
    .record(z.string(), z.union([z.string().max(500), z.number().int()]))
    .default({}),
});
export type MutationRequest = z.infer<typeof MutationRequest>;

/** Database errors raised by greathub.apply_mutation, as panel copy. */
export function mutationError(message: string): {
  status: number;
  message: string;
} {
  if (message.includes("unknown_sku"))
    return { status: 404, message: "No such SKU." };
  if (message.includes("invalid_params"))
    return {
      status: 422,
      message: "Those parameters don't apply to this item.",
    };
  if (message.includes("unknown_mutation"))
    return { status: 400, message: "Unknown mutation." };
  if (message.includes("no_baseline"))
    return { status: 409, message: "No baseline captured; re-run the seed." };
  return { status: 500, message: "The mutation failed." };
}
