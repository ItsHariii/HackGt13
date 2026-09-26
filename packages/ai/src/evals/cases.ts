import type { Operator } from "@proofcart/contracts";
import { FLAGSHIP_BRIEF } from "@proofcart/contracts/fixtures";
import { WEDDING_BRIEF } from "@proofcart/rule-packs/fixtures";

/*
 * The A1 eval set (TASKS T9.6): 20 briefs with the hard requirements a
 * careful reader would write down. Only requirements the shopper states are
 * listed as hard; anything the model has to infer lands as an unconfirmed
 * assumption, which the engine treats as a preference until confirmed.
 *
 * Every brief is dated 2026-09-26, a Saturday, so "Monday" is 2026-09-28.
 */

export type Expectation = {
  field: string;
  /** Required for fields whose prefix is not a role; omitted means any role. */
  role?: string;
  /** Omitted means any operator. */
  op?: Operator;
  /** The target as a person writes it; omitted means any value. */
  value?: string;
};

/** One hard requirement: the canonical reading plus acceptable alternatives. */
export type ExpectedHard = Expectation & {
  op: Operator;
  value: string;
  /** Words from the brief that make this a condition. */
  quote: string;
  alt?: readonly Expectation[];
};

export type EvalCase = {
  id: string;
  pack: "home-office" | "apparel" | "travel";
  brief: string;
  today: string;
  hard: readonly ExpectedHard[];
  /** Fields a good answer infers as assumptions; reported, not scored. */
  assumed?: readonly string[];
};

export const EVAL_TODAY = "2026-09-26";

const BUDGET_ALTS = (role?: string): Expectation[] => [
  { field: "basket.merchandise_total", op: "lte" },
  ...(role ? [{ field: "offer.price", role, op: "lte" as const }] : []),
];

const RETURNABLE_ALTS = (role?: string): Expectation[] => [
  { field: "offer.returnable", ...(role ? { role } : {}), value: "true" },
  { field: "offer.final_sale" },
];

/** With one item in the basket, its delivery date is the order's. */
const SINGLE_ITEM_DEADLINE = (role: string, date: string): Expectation[] => [
  { field: "offer.delivery_by", role, op: "lte", value: date },
  { field: "basket.delivery_latest", op: "before" },
];

export const EVAL_CASES: readonly EvalCase[] = [
  // Home office (8)
  {
    id: "ho-flagship",
    pack: "home-office",
    brief: FLAGSHIP_BRIEF,
    today: EVAL_TODAY,
    hard: [
      {
        field: "basket.delivered_total",
        op: "lte",
        value: "$1,000",
        quote: "under $1,000",
        alt: BUDGET_ALTS(),
      },
      {
        field: "desk.width",
        op: "lte",
        value: "48 in",
        quote: "fit a 48-inch alcove",
      },
      {
        field: "monitor.diagonal",
        op: "eq",
        value: "27 in",
        quote: "27-inch 4K monitor",
        alt: [{ field: "monitor.diagonal" }],
      },
      {
        field: "monitor.resolution",
        op: "eq",
        value: "4k",
        quote: "27-inch 4K monitor",
      },
      {
        field: "basket.delivery_latest",
        op: "lte",
        value: "2026-09-28",
        quote: "arrive by Monday",
        alt: [{ field: "basket.delivery_latest", op: "before" }],
      },
      {
        field: "order.substitutions_allowed",
        op: "eq",
        value: "false",
        quote: "Don't substitute anything without asking",
      },
    ],
    assumed: ["monitor.usb_c_pd_watts"],
  },
  {
    id: "ho-standing-desk",
    pack: "home-office",
    brief:
      "I need a standing desk no wider than 60 inches and a chair with adjustable lumbar support. Budget is $800 total.",
    today: EVAL_TODAY,
    hard: [
      {
        field: "desk.width",
        op: "lte",
        value: "60 in",
        quote: "no wider than 60 inches",
      },
      {
        field: "desk.height_adjustable",
        op: "eq",
        value: "true",
        quote: "standing desk",
      },
      {
        field: "chair.adjustable_lumbar",
        op: "eq",
        value: "true",
        quote: "adjustable lumbar support",
      },
      {
        field: "basket.delivered_total",
        op: "lte",
        value: "$800",
        quote: "Budget is $800 total",
        alt: BUDGET_ALTS(),
      },
    ],
  },
  {
    id: "ho-laptop-monitor",
    pack: "home-office",
    brief:
      "Looking for a 32-inch 4K monitor with at least 90 W USB-C power delivery for my laptop, plus a USB-C cable rated for 100 W. Keep it under $600.",
    today: EVAL_TODAY,
    hard: [
      {
        field: "monitor.diagonal",
        op: "eq",
        value: "32 in",
        quote: "32-inch 4K monitor",
        alt: [{ field: "monitor.diagonal" }],
      },
      {
        field: "monitor.resolution",
        op: "eq",
        value: "4k",
        quote: "32-inch 4K monitor",
      },
      {
        field: "monitor.usb_c_pd_watts",
        op: "gte",
        value: "90 W",
        quote: "at least 90 W USB-C power delivery",
      },
      {
        field: "cable.usb_pd_watts",
        op: "gte",
        value: "100 W",
        quote: "USB-C cable rated for 100 W",
      },
      {
        field: "basket.delivered_total",
        op: "lte",
        value: "$600",
        quote: "under $600",
        alt: BUDGET_ALTS(),
      },
    ],
  },
  {
    id: "ho-heavy-chair",
    pack: "home-office",
    brief:
      "Office chair that supports at least 300 lb, with adjustable lumbar. It must not be final sale. Under $400.",
    today: EVAL_TODAY,
    hard: [
      {
        field: "chair.max_load",
        op: "gte",
        value: "300 lb",
        quote: "supports at least 300 lb",
      },
      {
        field: "chair.adjustable_lumbar",
        op: "eq",
        value: "true",
        quote: "adjustable lumbar",
      },
      {
        field: "offer.final_sale",
        role: "chair",
        op: "eq",
        value: "false",
        quote: "must not be final sale",
        alt: RETURNABLE_ALTS("chair"),
      },
      {
        field: "basket.delivered_total",
        op: "lte",
        value: "$400",
        quote: "Under $400",
        alt: BUDGET_ALTS("chair"),
      },
    ],
  },
  {
    id: "ho-dock-webcam",
    pack: "home-office",
    brief:
      "I need a dock that can drive DisplayPort monitors and deliver 96 W to my laptop, and a 1080p webcam. Everything should arrive by Thursday, October 1.",
    today: EVAL_TODAY,
    hard: [
      {
        field: "dock.video_out",
        op: "contains",
        value: "DisplayPort",
        quote: "drive DisplayPort monitors",
      },
      {
        field: "dock.usb_c_pd_watts",
        op: "gte",
        value: "96 W",
        quote: "deliver 96 W to my laptop",
      },
      {
        field: "webcam.resolution",
        op: "eq",
        value: "1080p",
        quote: "1080p webcam",
      },
      {
        field: "basket.delivery_latest",
        op: "lte",
        value: "2026-10-01",
        quote: "arrive by Thursday, October 1",
        alt: [{ field: "basket.delivery_latest", op: "before" }],
      },
    ],
  },
  {
    id: "ho-corner-desk",
    pack: "home-office",
    brief:
      "Desk for a corner that's 40 inches wide and only 24 inches deep. It must be height adjustable. Ship everything from one store.",
    today: EVAL_TODAY,
    hard: [
      {
        field: "desk.width",
        op: "lte",
        value: "40 in",
        quote: "40 inches wide",
      },
      {
        field: "desk.depth",
        op: "lte",
        value: "24 in",
        quote: "only 24 inches deep",
      },
      {
        field: "desk.height_adjustable",
        op: "eq",
        value: "true",
        quote: "must be height adjustable",
      },
      {
        field: "basket.merchant_count",
        op: "lte",
        value: "1",
        quote: "Ship everything from one store",
        alt: [{ field: "basket.merchant_count", op: "eq", value: "1" }],
      },
    ],
  },
  {
    id: "ho-1440p-monitor",
    pack: "home-office",
    brief:
      "Just a monitor: 27 inches, 1440p, with an HDMI input, under $300, delivered by Friday, October 2.",
    today: EVAL_TODAY,
    hard: [
      {
        field: "monitor.diagonal",
        op: "eq",
        value: "27 in",
        quote: "27 inches",
        alt: [{ field: "monitor.diagonal" }],
      },
      { field: "monitor.resolution", op: "eq", value: "1440p", quote: "1440p" },
      {
        field: "monitor.video_in",
        op: "contains",
        value: "HDMI",
        quote: "an HDMI input",
      },
      {
        field: "basket.delivered_total",
        op: "lte",
        value: "$300",
        quote: "under $300",
        alt: BUDGET_ALTS("monitor"),
      },
      {
        field: "basket.delivery_latest",
        op: "lte",
        value: "2026-10-02",
        quote: "delivered by Friday, October 2",
        alt: [
          { field: "offer.delivery_by", role: "monitor" },
          { field: "basket.delivery_latest", op: "before" },
        ],
      },
    ],
  },
  {
    id: "ho-teen-setup",
    pack: "home-office",
    brief:
      "Home office setup for my teenager: a desk at least 42 inches wide, a chair, and a webcam that does 4K. The total must stay below $700 and no substitutions.",
    today: EVAL_TODAY,
    hard: [
      {
        field: "desk.width",
        op: "gte",
        value: "42 in",
        quote: "at least 42 inches wide",
      },
      {
        field: "webcam.resolution",
        op: "eq",
        value: "4k",
        quote: "webcam that does 4K",
      },
      {
        field: "basket.delivered_total",
        op: "lte",
        value: "$700",
        quote: "stay below $700",
        alt: BUDGET_ALTS(),
      },
      {
        field: "order.substitutions_allowed",
        op: "eq",
        value: "false",
        quote: "no substitutions",
      },
    ],
  },

  // Apparel (6)
  {
    id: "ap-wedding",
    pack: "apparel",
    brief: WEDDING_BRIEF,
    today: EVAL_TODAY,
    hard: [
      {
        field: "basket.delivered_total",
        op: "lte",
        value: "$250",
        quote: "under $250",
        alt: BUDGET_ALTS(),
      },
      {
        field: "basket.delivery_latest",
        op: "lte",
        value: "2026-10-07",
        quote: "arrive by Wednesday",
        alt: [
          { field: "basket.delivery_latest", value: "2026-09-30" },
          { field: "basket.delivery_latest", op: "before" },
        ],
      },
      {
        field: "offer.final_sale",
        role: "dress",
        op: "eq",
        value: "false",
        quote: "be returnable",
        alt: RETURNABLE_ALTS(),
      },
      {
        field: "basket.exchange_ready_by",
        op: "lte",
        value: "2026-10-09",
        quote: "exchange sizes before Friday",
        alt: [{ field: "basket.exchange_ready_by" }],
      },
      {
        field: "garment.color",
        role: "dress",
        op: "eq",
        value: "navy",
        quote: "navy outfit",
        alt: [{ field: "garment.color", value: "navy" }],
      },
    ],
  },
  {
    id: "ap-linen-shirt",
    pack: "apparel",
    brief: "A navy linen shirt, 100% linen, size M, under $90.",
    today: EVAL_TODAY,
    hard: [
      {
        field: "garment.color",
        role: "top",
        op: "eq",
        value: "navy",
        quote: "navy linen shirt",
        alt: [{ field: "garment.color", value: "navy" }],
      },
      {
        field: "garment.fibers",
        role: "top",
        op: "contains",
        value: "linen",
        quote: "100% linen",
        alt: [{ field: "garment.fibers" }],
      },
      {
        field: "garment.size",
        role: "top",
        op: "eq",
        value: "M",
        quote: "size M",
        alt: [{ field: "garment.size", value: "M" }],
      },
      {
        field: "basket.delivered_total",
        op: "lte",
        value: "$90",
        quote: "under $90",
        alt: BUDGET_ALTS("top"),
      },
    ],
  },
  {
    id: "ap-dress-shoes",
    pack: "apparel",
    brief:
      "Black dress shoes with a heel no higher than 2 inches, returnable with free returns, arriving by October 3.",
    today: EVAL_TODAY,
    hard: [
      {
        field: "garment.color",
        role: "shoes",
        op: "eq",
        value: "black",
        quote: "Black dress shoes",
        alt: [{ field: "garment.color", value: "black" }],
      },
      {
        field: "shoes.heel_height",
        op: "lte",
        value: "2 in",
        quote: "heel no higher than 2 inches",
      },
      {
        field: "offer.final_sale",
        role: "shoes",
        op: "eq",
        value: "false",
        quote: "returnable",
        alt: RETURNABLE_ALTS("shoes"),
      },
      {
        field: "offer.return_fee",
        role: "shoes",
        op: "lte",
        value: "$0",
        quote: "free returns",
        alt: [{ field: "offer.return_fee" }],
      },
      {
        field: "basket.delivery_latest",
        op: "lte",
        value: "2026-10-03",
        quote: "arriving by October 3",
        alt: SINGLE_ITEM_DEADLINE("shoes", "2026-10-03"),
      },
    ],
  },
  {
    id: "ap-suit",
    pack: "apparel",
    brief:
      "I need a suit with a 32 inch waist and a 40 inch jacket chest, no wool, for under $500.",
    today: EVAL_TODAY,
    hard: [
      {
        field: "garment.waist",
        role: "suit",
        op: "eq",
        value: "32 in",
        quote: "32 inch waist",
        alt: [{ field: "garment.waist" }],
      },
      {
        field: "garment.chest",
        role: "suit",
        op: "eq",
        value: "40 in",
        quote: "40 inch jacket chest",
        alt: [{ field: "garment.chest" }, { field: "garment.fit_chest" }],
      },
      {
        field: "garment.fibers",
        role: "suit",
        op: "excludes",
        value: "wool",
        quote: "no wool",
        alt: [{ field: "garment.fibers", op: "excludes" }],
      },
      {
        field: "basket.delivered_total",
        op: "lte",
        value: "$500",
        quote: "under $500",
        alt: BUDGET_ALTS("suit"),
      },
    ],
  },
  {
    id: "ap-winter-coat",
    pack: "apparel",
    brief:
      "Winter coat in olive or charcoal. It must not be final sale, needs a return window of at least 30 days, and should cost under $300.",
    today: EVAL_TODAY,
    hard: [
      {
        field: "garment.color",
        role: "outerwear",
        op: "in",
        value: "olive, charcoal",
        quote: "olive or charcoal",
        alt: [{ field: "garment.color", op: "in" }],
      },
      {
        field: "offer.final_sale",
        role: "outerwear",
        op: "eq",
        value: "false",
        quote: "must not be final sale",
        alt: RETURNABLE_ALTS("outerwear"),
      },
      {
        field: "offer.return_window_days",
        role: "outerwear",
        op: "gte",
        value: "30 days",
        quote: "return window of at least 30 days",
        alt: [{ field: "offer.return_window_days", op: "gte" }],
      },
      {
        field: "basket.delivered_total",
        op: "lte",
        value: "$300",
        quote: "under $300",
        alt: BUDGET_ALTS("outerwear"),
      },
    ],
  },
  {
    id: "ap-beach-dress",
    pack: "apparel",
    brief:
      "Summer dress for a beach trip: cotton or linen only, no longer than 40 inches, under $120, arriving by September 30.",
    today: EVAL_TODAY,
    hard: [
      {
        field: "garment.fibers",
        role: "dress",
        op: "in",
        value: "cotton, linen",
        quote: "cotton or linen only",
        alt: [{ field: "garment.fibers" }],
      },
      {
        field: "garment.length",
        role: "dress",
        op: "lte",
        value: "40 in",
        quote: "no longer than 40 inches",
        alt: [{ field: "garment.length", op: "lte" }],
      },
      {
        field: "basket.delivered_total",
        op: "lte",
        value: "$120",
        quote: "under $120",
        alt: BUDGET_ALTS("dress"),
      },
      {
        field: "basket.delivery_latest",
        op: "lte",
        value: "2026-09-30",
        quote: "arriving by September 30",
        alt: SINGLE_ITEM_DEADLINE("dress", "2026-09-30"),
      },
    ],
  },

  // Travel (6)
  {
    id: "tr-carry-on",
    pack: "travel",
    brief:
      "Carry-on bag that fits my airline's 22 x 14 x 9 in limit and weighs under 8 lb, plus a power bank under 100 Wh.",
    today: EVAL_TODAY,
    hard: [
      {
        field: "bag.dimensions",
        op: "lte",
        value: "22 x 14 x 9 in",
        quote: "22 x 14 x 9 in limit",
      },
      {
        field: "bag.weight",
        op: "lte",
        value: "8 lb",
        quote: "weighs under 8 lb",
      },
      {
        field: "power_bank.energy_wh",
        op: "lte",
        value: "100 Wh",
        quote: "power bank under 100 Wh",
      },
    ],
  },
  {
    id: "tr-london",
    pack: "travel",
    brief:
      "Going to London: I need a Type G adapter, and my hair dryer has to work on 230 V. Keep it under $60.",
    today: EVAL_TODAY,
    hard: [
      {
        field: "adapter.plug_types",
        op: "contains",
        value: "G",
        quote: "Type G adapter",
        alt: [{ field: "adapter.plug_types" }],
      },
      {
        field: "device.input_voltage",
        op: "contains",
        value: "230 V",
        quote: "work on 230 V",
        alt: [{ field: "device.input_voltage" }],
      },
      {
        field: "basket.delivered_total",
        op: "lte",
        value: "$60",
        quote: "under $60",
        alt: BUDGET_ALTS(),
      },
    ],
  },
  {
    id: "tr-tsa",
    pack: "travel",
    brief:
      "TSA-friendly toiletry bottles, each 100 ml or less, and a 20,000 mAh power bank I can fly with.",
    today: EVAL_TODAY,
    hard: [
      {
        field: "toiletry.volume",
        op: "lte",
        value: "100 ml",
        quote: "100 ml or less",
      },
      {
        field: "power_bank.capacity_mah",
        op: "gte",
        value: "20,000 mAh",
        quote: "20,000 mAh power bank",
        alt: [{ field: "power_bank.capacity_mah" }],
      },
    ],
    assumed: ["power_bank.energy_wh"],
  },
  {
    id: "tr-personal-item",
    pack: "travel",
    brief:
      "Personal item bag no bigger than 18 x 14 x 8 inches, under $80, delivered by October 5.",
    today: EVAL_TODAY,
    hard: [
      {
        field: "bag.dimensions",
        op: "lte",
        value: "18 x 14 x 8 in",
        quote: "no bigger than 18 x 14 x 8 inches",
      },
      {
        field: "basket.delivered_total",
        op: "lte",
        value: "$80",
        quote: "under $80",
        alt: BUDGET_ALTS("bag"),
      },
      {
        field: "basket.delivery_latest",
        op: "lte",
        value: "2026-10-05",
        quote: "delivered by October 5",
        alt: SINGLE_ITEM_DEADLINE("bag", "2026-10-05"),
      },
    ],
  },
  {
    id: "tr-europe",
    pack: "travel",
    brief:
      "Trip to Europe: an adapter for Type C plugs and a charger that accepts 100-240 V, delivered by Thursday.",
    today: EVAL_TODAY,
    hard: [
      {
        field: "adapter.plug_types",
        op: "contains",
        value: "C",
        quote: "adapter for Type C plugs",
        alt: [{ field: "adapter.plug_types" }],
      },
      {
        field: "device.input_voltage",
        op: "eq",
        value: "100-240 V",
        quote: "accepts 100-240 V",
        alt: [{ field: "device.input_voltage" }],
      },
      {
        field: "basket.delivery_latest",
        op: "lte",
        value: "2026-10-01",
        quote: "delivered by Thursday",
        alt: [{ field: "basket.delivery_latest", op: "before" }],
      },
    ],
  },
  {
    id: "tr-big-power-bank",
    pack: "travel",
    brief:
      "I want a power bank with at least 25,000 mAh but no more than 100 Wh so I can carry it on a plane, and it must be in stock.",
    today: EVAL_TODAY,
    hard: [
      {
        field: "power_bank.capacity_mah",
        op: "gte",
        value: "25,000 mAh",
        quote: "at least 25,000 mAh",
      },
      {
        field: "power_bank.energy_wh",
        op: "lte",
        value: "100 Wh",
        quote: "no more than 100 Wh",
      },
      {
        field: "offer.availability",
        role: "power_bank",
        op: "eq",
        value: "in_stock",
        quote: "must be in stock",
        alt: [{ field: "offer.availability" }],
      },
    ],
  },
];
