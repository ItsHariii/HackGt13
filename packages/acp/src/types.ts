// Agentic Commerce Protocol checkout types, API-Version 2025-09-12 (SDD §13.1).
// Response schemas are loose (unknown fields survive) so a newer merchant doesn't
// break parsing; request schemas are strict because the merchant validates them.

import { z } from "zod";

export const ACP_API_VERSION = "2025-09-12";

const Minor = z.number().int().nonnegative();

export const Address = z.strictObject({
  name: z.string().min(1).max(256),
  line_one: z.string().min(1).max(256),
  line_two: z.string().max(256).optional(),
  city: z.string().min(1).max(128),
  state: z.string().min(1).max(64),
  country: z.string().regex(/^[A-Z]{2}$/, "ISO 3166-1 alpha-2"),
  postal_code: z.string().min(1).max(20),
});
export type Address = z.infer<typeof Address>;

export const Buyer = z.strictObject({
  first_name: z.string().min(1).max(256),
  last_name: z.string().max(256).optional(),
  email: z.email().max(256),
  phone_number: z.string().max(32).optional(),
});
export type Buyer = z.infer<typeof Buyer>;

export const Item = z.strictObject({
  id: z.string().min(1).max(64),
  quantity: z.number().int().min(1).max(99),
});
export type Item = z.infer<typeof Item>;

/** DemoMart's product-fact extension on each line item (ACP carries none). */
export const XProofcartItem = z.looseObject({
  title: z.string(),
  seller_id: z.string(),
  gtin: z.string(),
  mpn: z.string(),
  /** GTIN of what will actually ship; differs from `gtin` after a variant swap. */
  ships_gtin: z.string(),
  final_sale: z.boolean(),
  return_policy: z.looseObject({
    returnable: z.boolean(),
    windowDays: z.number().int().nonnegative(),
    feeMinor: Minor,
    finalSale: z.boolean(),
  }),
  pack_size: z.number().int().positive(),
  subscription: z
    .looseObject({ every: z.string(), priceMinor: Minor })
    .nullable(),
  availability: z.enum(["in_stock", "limited", "out_of_stock"]),
  delivery: z.looseObject({
    min_days: z.number().int(),
    max_days: z.number().int(),
  }),
  spec_url: z.url(),
  offer_id: z.string(),
  offer_revision: z.number().int().positive(),
});
export type XProofcartItem = z.infer<typeof XProofcartItem>;

export const LineItem = z.looseObject({
  id: z.string(),
  item: z.looseObject({
    id: z.string(),
    quantity: z.number().int(),
    x_proofcart: XProofcartItem.optional(),
  }),
  base_amount: Minor,
  discount: Minor,
  subtotal: Minor,
  tax: Minor,
  total: Minor,
});
export type LineItem = z.infer<typeof LineItem>;

export const TOTAL_TYPES = [
  "items_base_amount",
  "items_discount",
  "subtotal",
  "discount",
  "fulfillment",
  "tax",
  "fee",
  "total",
] as const;
export const Total = z.looseObject({
  type: z.enum(TOTAL_TYPES),
  display_text: z.string(),
  amount: z.number().int(),
});
export type Total = z.infer<typeof Total>;

export const FulfillmentOption = z.looseObject({
  type: z.literal("shipping"),
  id: z.string(),
  title: z.string(),
  subtitle: z.string().optional(),
  carrier: z.string().optional(),
  earliest_delivery_time: z.string().optional(),
  latest_delivery_time: z.string().optional(),
  subtotal: Minor,
  tax: Minor,
  total: Minor,
});
export type FulfillmentOption = z.infer<typeof FulfillmentOption>;

export const MESSAGE_ERROR_CODES = [
  "missing",
  "invalid",
  "out_of_stock",
  "payment_declined",
  "requires_sign_in",
  "requires_3ds",
] as const;
export type MessageErrorCode = (typeof MESSAGE_ERROR_CODES)[number];

export const Message = z.discriminatedUnion("type", [
  z.looseObject({
    type: z.literal("info"),
    param: z.string().optional(),
    content_type: z.enum(["plain", "markdown"]),
    content: z.string(),
  }),
  z.looseObject({
    type: z.literal("error"),
    code: z.enum(MESSAGE_ERROR_CODES),
    param: z.string().optional(),
    content_type: z.enum(["plain", "markdown"]),
    content: z.string(),
  }),
]);
export type Message = z.infer<typeof Message>;

export const Link = z.looseObject({
  type: z.enum(["terms_of_use", "privacy_policy", "seller_shop_policies"]),
  url: z.url(),
});
export type Link = z.infer<typeof Link>;

export const SESSION_STATUSES = [
  "not_ready_for_payment",
  "ready_for_payment",
  "completed",
  "canceled",
] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export const Order = z.looseObject({
  id: z.string(),
  checkout_session_id: z.string(),
  permalink_url: z.url(),
});
export type Order = z.infer<typeof Order>;

/** The contract a session is being created for (DemoMart extension). */
export const ContractRef = z.strictObject({
  contract_id: z.string().min(1).max(128),
  version: z.number().int().positive(),
  body_hash: z.string().regex(/^sha256:[0-9a-f]{64}$/),
});
export type ContractRef = z.infer<typeof ContractRef>;

export const CheckoutSession = z.looseObject({
  id: z.string(),
  buyer: Buyer.loose().optional(),
  payment_provider: z
    .looseObject({
      provider: z.string(),
      supported_payment_methods: z.array(z.string()),
    })
    .optional(),
  status: z.enum(SESSION_STATUSES),
  currency: z.string(),
  line_items: z.array(LineItem),
  fulfillment_address: Address.loose().optional(),
  fulfillment_options: z.array(FulfillmentOption),
  fulfillment_option_id: z.string().optional(),
  totals: z.array(Total),
  messages: z.array(Message),
  links: z.array(Link),
  order: Order.optional(),
  x_proofcart: z
    .looseObject({
      contract: ContractRef.loose().nullable(),
      revision: z.string(),
    })
    .optional(),
});
export type CheckoutSession = z.infer<typeof CheckoutSession>;

export const CreateSessionRequest = z.strictObject({
  items: z.array(Item).min(1).max(50),
  buyer: Buyer.optional(),
  fulfillment_address: Address.optional(),
  x_proofcart: z.strictObject({ contract: ContractRef }).optional(),
});
export type CreateSessionRequest = z.infer<typeof CreateSessionRequest>;

export const UpdateSessionRequest = z
  .strictObject({
    items: z.array(Item).min(1).max(50).optional(),
    buyer: Buyer.optional(),
    fulfillment_address: Address.optional(),
    fulfillment_option_id: z.string().min(1).max(64).optional(),
    x_proofcart: z.strictObject({ contract: ContractRef }).optional(),
  })
  .refine((r) => Object.keys(r).length > 0, "nothing to update");
export type UpdateSessionRequest = z.infer<typeof UpdateSessionRequest>;

/**
 * `payment_data.provider = "proofcart"` carries a scoped payment grant (a JWS)
 * as the token. `x_proofcart` carries the signed contract so the merchant can
 * check the grant against it and keep it as dispute evidence.
 */
export const CompleteSessionRequest = z.strictObject({
  buyer: Buyer.optional(),
  payment_data: z.strictObject({
    token: z.string().min(1).max(8192),
    provider: z.string().min(1).max(64),
    billing_address: Address.optional(),
  }),
  x_proofcart: z
    .strictObject({
      contract: z.record(z.string(), z.unknown()),
      signature: z.record(z.string(), z.unknown()).optional(),
    })
    .optional(),
});
export type CompleteSessionRequest = z.infer<typeof CompleteSessionRequest>;

export const ERROR_TYPES = [
  "invalid_request",
  "request_not_idempotent",
  "processing_error",
  "service_unavailable",
  // Not in the ACP core: RFC 9421 verification failures (SDD §13.1 deviation).
  "unauthorized",
] as const;
export const AcpError = z.looseObject({
  type: z.enum(ERROR_TYPES),
  code: z.string(),
  message: z.string(),
  param: z.string().optional(),
});
export type AcpError = z.infer<typeof AcpError>;

/** Order webhook body DemoMart POSTs to ProofCart. */
export const OrderEvent = z.looseObject({
  type: z.enum(["order_created", "order_updated"]),
  event_id: z.string(),
  created_at: z.string(),
  data: z.looseObject({
    type: z.literal("order"),
    checkout_session_id: z.string(),
    order_id: z.string(),
    permalink_url: z.url(),
    status: z.enum([
      "created",
      "manual_review",
      "confirmed",
      "canceled",
      "shipped",
      "fulfilled",
    ]),
    total_minor: Minor,
    currency: z.string(),
    contract: ContractRef.loose().nullable(),
    payment: z.looseObject({
      rail: z.string(),
      transaction_id: z.string().nullable(),
    }),
  }),
});
export type OrderEvent = z.infer<typeof OrderEvent>;
