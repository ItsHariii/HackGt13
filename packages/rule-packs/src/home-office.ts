import {
  effectiveImportance,
  type Quantity,
  type Requirement,
  type Value,
} from "@proofcart/contracts";
import {
  type BasketReader,
  compareQuantity,
  definePack,
  isQuantity,
  isStringList,
  normalizeText,
} from "@proofcart/proof-engine";

/*
 * Home office (SDD §8.3, §16.1): desk width ≤ space; monitor diagonal and
 * resolution; USB-C power ≥ what the laptop needs; dock ↔ monitor video;
 * cable PD rating; required roles; delivered total ≤ budget; delivery ≤
 * deadline. Comfort is subjective and always "can't check".
 */

const MACBOOK_WATTS: Quantity = { value: 65, unit: "W" };

/** The watts the laptop needs: the largest hard USB-C power target, if any. */
export function requiredLaptopWatts(
  requirements: readonly Requirement[],
): Quantity | null {
  let best: Quantity | null = null;
  for (const r of requirements) {
    if (
      r.field !== "monitor.usb_c_pd_watts" ||
      r.op !== "gte" ||
      effectiveImportance(r) !== "hard"
    )
      continue;
    if (!isQuantity(r.target)) continue;
    if (!best || compareQuantity(r.target, best) === 1) best = r.target;
  }
  return best;
}

/** A dock is needed when the monitor can't power the laptop by itself. */
function dockRequired(basket: BasketReader) {
  const need = requiredLaptopWatts(basket.requirements);
  if (!need) return { required: false, from: [] };
  const monitors = basket.byRole("monitor");
  if (monitors.length === 0) return null;
  const from = monitors.map((m) => m.get("monitor.usb_c_pd_watts"));
  if (from.some((r) => r.state === "unknown" || !isQuantity(r.value)))
    return null;
  const short = from.some(
    (r) => compareQuantity(r.value as Quantity, need) === -1,
  );
  return { required: short, from };
}

/** A USB-C cable is needed when any monitor takes USB-C input. */
function cableRequired(basket: BasketReader) {
  const monitors = basket.byRole("monitor");
  if (monitors.length === 0) return { required: false, from: [] };
  const from = monitors.map((m) => m.get("monitor.video_in"));
  if (from.some((r) => r.state === "unknown" || !isStringList(r.value)))
    return null;
  const usbC = from.some((r) =>
    (r.value as string[]).some((p) => normalizeText(p) === "usb-c"),
  );
  return { required: usbC, from };
}

const VIDEO_ALIASES = {
  "usb-c dp alt": "usb-c",
  "usb-c (dp alt mode)": "usb-c",
  "usb type-c": "usb-c",
  thunderbolt: "usb-c",
  "thunderbolt 4": "usb-c",
  displayport: "dp",
  "displayport 1.4": "dp",
  "hdmi 2.0": "hdmi",
  "hdmi 2.1": "hdmi",
} as const;

export const homeOffice = definePack({
  id: "home-office",
  version: "1.0.0",
  title: "Home office",
  fields: {
    "desk.width": {
      kind: "length",
      label: "Desk width",
      unit: "in",
      authority: ["manufacturer", "merchant"],
      freshness: "90d",
    },
    "desk.depth": {
      kind: "length",
      label: "Desk depth",
      unit: "in",
      authority: ["manufacturer", "merchant"],
      freshness: "90d",
    },
    "desk.height_adjustable": {
      kind: "boolean",
      label: "Height adjustable",
      authority: ["manufacturer", "merchant"],
    },
    "chair.adjustable_lumbar": {
      kind: "boolean",
      label: "Adjustable lumbar",
      authority: ["manufacturer", "merchant"],
    },
    "chair.max_load": {
      kind: "mass",
      label: "Maximum load",
      unit: "lb",
      authority: ["manufacturer"],
    },
    "chair.comfort": { kind: "subjective", label: "Chair comfort" },
    "monitor.diagonal": {
      kind: "length",
      label: "Screen size",
      unit: "in",
      authority: ["manufacturer"],
      freshness: "365d",
    },
    "monitor.resolution": {
      kind: "enum",
      label: "Resolution",
      values: ["1080p", "1440p", "4k", "5k"],
      aliases: {
        "full hd": "1080p",
        fhd: "1080p",
        "1920x1080": "1080p",
        qhd: "1440p",
        "2560x1440": "1440p",
        uhd: "4k",
        "4k uhd": "4k",
        "2160p": "4k",
        "3840x2160": "4k",
      },
      authority: ["manufacturer"],
      freshness: "365d",
    },
    "monitor.usb_c_pd_watts": {
      kind: "power",
      label: "USB-C power",
      unit: "W",
      authority: ["manufacturer"],
      freshness: "30d",
    },
    "monitor.video_in": {
      kind: "list",
      label: "Video inputs",
      aliases: VIDEO_ALIASES,
      authority: ["manufacturer"],
    },
    "cable.usb_pd_watts": {
      kind: "power",
      label: "Cable power rating",
      unit: "W",
      authority: ["manufacturer"],
      freshness: "365d",
    },
    "cable.length": {
      kind: "length",
      label: "Cable length",
      unit: "m",
      authority: ["manufacturer", "merchant"],
    },
    "dock.video_out": {
      kind: "list",
      label: "Dock video outputs",
      aliases: VIDEO_ALIASES,
      authority: ["manufacturer"],
    },
    "dock.usb_c_pd_watts": {
      kind: "power",
      label: "Dock USB-C power",
      unit: "W",
      authority: ["manufacturer"],
    },
    "dock.monitor_video": { kind: "boolean", label: "Dock-to-monitor video" },
    "webcam.resolution": {
      kind: "enum",
      label: "Webcam resolution",
      values: ["720p", "1080p", "4k"],
      aliases: {
        hd: "720p",
        "full hd": "1080p",
        fhd: "1080p",
        uhd: "4k",
        "2160p": "4k",
      },
      authority: ["manufacturer"],
    },
  },
  jsonLd: {
    "desk.width": ["width", "additionalProperty[name=Width].value"],
    "desk.depth": ["depth", "additionalProperty[name=Depth].value"],
    "chair.adjustable_lumbar": [
      "additionalProperty[name=Adjustable lumbar].value",
    ],
    "monitor.diagonal": [
      "additionalProperty[name=Screen size].value",
      "additionalProperty[name=Diagonal].value",
    ],
    "monitor.resolution": ["additionalProperty[name=Resolution].value"],
    "monitor.usb_c_pd_watts": [
      "additionalProperty[name=USB-C power delivery].value",
      "additionalProperty[name=USB-C PD].value",
    ],
    "monitor.video_in": ["additionalProperty[name=Video inputs].value"],
    "cable.usb_pd_watts": ["additionalProperty[name=Power rating].value"],
    "dock.video_out": ["additionalProperty[name=Video outputs].value"],
    "webcam.resolution": ["additionalProperty[name=Resolution].value"],
  },
  roles: [
    { role: "desk", label: "Desk", required: true },
    { role: "chair", label: "Chair", required: true },
    { role: "monitor", label: "Monitor", required: true },
    { role: "dock", label: "Dock", required: dockRequired },
    { role: "cable", label: "USB-C cable", required: cableRequired },
    { role: "webcam", label: "Webcam", required: false },
  ],
  pairs: [
    {
      id: "dock_monitor_video",
      roles: ["dock", "monitor"],
      field: "dock.monitor_video",
      label: "Dock-to-monitor video",
      evaluate(dock, monitor) {
        const out = dock.get("dock.video_out");
        const inp = monitor.get("monitor.video_in");
        if (!isStringList(out.value) || !isStringList(inp.value)) return null;
        const def = {
          kind: "list",
          label: "",
          aliases: VIDEO_ALIASES,
        } as const;
        const ports = new Set(inp.value.map((p) => normalizeText(p, def)));
        return {
          value: out.value.some((p) => ports.has(normalizeText(p, def))),
          from: [out, inp],
        };
      },
    },
  ],
  defaults: [
    {
      ruleId: "budget",
      build: (p) =>
        p.budget === undefined
          ? null
          : {
              scope: "basket",
              field: "basket.delivered_total",
              op: "lte",
              target: p.budget,
              importance: "hard",
              minStateToPass: "verified",
              materiality: "always",
            },
    },
    {
      ruleId: "deadline",
      build: (p) =>
        p.deadline === undefined
          ? null
          : {
              scope: "basket",
              field: "basket.delivery_latest",
              op: "lte",
              target: p.deadline,
              importance: "hard",
              minStateToPass: "estimated",
              materiality: "on_verdict_change",
            },
    },
    {
      ruleId: "cable_pd",
      build: (p) => ({
        scope: "item",
        role: "cable",
        field: "cable.usb_pd_watts",
        op: "gte",
        target: (p.laptopWatts as Value | undefined) ?? MACBOOK_WATTS,
        importance: "hard",
        minStateToPass: "source_stated",
        materiality: "on_verdict_change",
      }),
    },
    {
      ruleId: "dock_video",
      build: () => ({
        scope: "pair",
        role: "dock",
        pairRole: "monitor",
        field: "dock.monitor_video",
        op: "compatible_with",
        target: true,
        importance: "hard",
        minStateToPass: "source_stated",
        materiality: "on_verdict_change",
      }),
    },
    {
      ruleId: "roles",
      build: () => ({
        scope: "basket",
        field: "basket.missing_roles",
        op: "eq",
        target: [],
        importance: "hard",
        minStateToPass: "source_stated",
        materiality: "on_verdict_change",
      }),
    },
    {
      ruleId: "chair_comfort",
      build: () => ({
        scope: "item",
        role: "chair",
        field: "chair.comfort",
        op: "exists",
        target: true,
        importance: "hard",
        minStateToPass: "source_stated",
        materiality: "on_verdict_change",
      }),
    },
  ],
});
