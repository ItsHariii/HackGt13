import type { Value } from "@cartel/contracts";
import { fieldDef, type Pack, readAs } from "@cartel/proof-engine";
import { claim, normalizeGtin } from "../claims";
import {
  type FetchLike,
  httpRequest,
  parseJsonBody,
  SourceError,
} from "../http";
import { fieldAppliesTo, packsForRoles } from "../jsonld";
import { cachedFetch, type Snapshot, type SnapshotStore } from "../snapshot";
import { type ClaimedFact, SOURCE_AUTHORITY } from "../types";
import { inferRoles } from "./roles";

/*
 * Icecat enrichment (SDD §11.2, T7.10). Icecat publishes manufacturer spec
 * sheets by GTIN; for a field whose pack names the manufacturer as authority
 * its values are `verified`. A seller page that disagrees becomes a conflict
 * in the fact store and renders as **Sources disagree**.
 *
 * Features are identified by Icecat's numeric feature IDs, which are stable
 * across products and languages; a name pattern is the fallback for features
 * whose ID varies by category.
 */

const LABEL = "Icecat";
export const ICECAT_API = "https://live.icecat.biz/api";

type IcecatFeature = {
  Feature: {
    ID: string | number;
    Name?: { Value?: string };
    Measure?: { Signs?: { _?: string } };
  };
  RawValue?: string | null;
  PresentationValue?: string | null;
};

export type IcecatSheet = {
  GeneralInfo: {
    IcecatId?: number;
    Title?: string;
    Brand?: string;
    BrandPartCode?: string;
    GTIN?: string[];
    ProductName?: string;
    Category?: { Name?: { Value?: string } };
  };
  FeaturesGroups?: {
    FeatureGroup?: { Name?: { Value?: string } };
    Features: IcecatFeature[];
  }[];
};

type Feature = {
  id: string;
  name: string;
  raw: string;
  sign: string;
  presentation: string;
};

function features(sheet: IcecatSheet): Feature[] {
  return (sheet.FeaturesGroups ?? []).flatMap((g) =>
    g.Features.map((f) => ({
      id: String(f.Feature.ID),
      name: f.Feature.Name?.Value ?? "",
      raw: (f.RawValue ?? "").trim(),
      sign: f.Feature.Measure?.Signs?._?.trim() ?? "",
      presentation: (f.PresentationValue ?? "").trim(),
    })),
  );
}

type Finder = { ids?: string[]; name?: RegExp };

function find(fs: readonly Feature[], by: Finder): Feature | undefined {
  return (
    fs.find((f) => by.ids?.includes(f.id) && f.raw !== "") ??
    (by.name
      ? fs.find((f) => by.name?.test(f.name) && f.raw !== "")
      : undefined)
  );
}

const yes = (f: Feature | undefined) => f?.raw === "Y";
const positive = (f: Feature | undefined) => !!f && Number(f.raw) > 0;

/** Raw value plus unit sign as text the unit parser reads: `27"`, `90 W`, `611.44 mm`. */
function measureText(f: Feature): string {
  if (!f.sign) return f.raw;
  return /^["'″]$/.test(f.sign) ? `${f.raw}${f.sign}` : `${f.raw} ${f.sign}`;
}

type Mapping = {
  field: string;
  read(fs: readonly Feature[]): { raw: string; text: string } | null;
};

function measure(field: string, by: Finder): Mapping {
  return {
    field,
    read(fs) {
      const f = find(fs, by);
      return f
        ? { raw: f.presentation || measureText(f), text: measureText(f) }
        : null;
    },
  };
}

function flag(field: string, by: Finder): Mapping {
  return {
    field,
    read(fs) {
      const f = find(fs, by);
      return f && (f.raw === "Y" || f.raw === "N")
        ? { raw: f.presentation, text: f.raw === "Y" ? "yes" : "no" }
        : null;
    },
  };
}

/**
 * Feature → pack field. IDs verified against live sheets (Dell U2723QE,
 * ViewSonic VP2785-4K) on 2026-09-26.
 */
export const ICECAT_MAPPINGS: readonly Mapping[] = [
  measure("monitor.diagonal", { ids: ["944"] }),
  {
    field: "monitor.resolution",
    read(fs) {
      const f = find(fs, { ids: ["1585"] });
      // "3840 x 2160" → "3840x2160", which the pack's aliases know.
      return f
        ? { raw: f.presentation, text: f.raw.replace(/\s*[x×]\s*/i, "x") }
        : null;
    },
  },
  measure("monitor.usb_c_pd_watts", {
    ids: ["38616"],
    name: /^USB Power Delivery up to$/i,
  }),
  {
    field: "monitor.video_in",
    read(fs) {
      const hdmi = find(fs, { ids: ["5620"] });
      const dp = find(fs, { ids: ["6611"] });
      const miniDp = find(fs, { ids: ["7274"] });
      const altMode = find(fs, { name: /DisplayPort Alternate Mode/i });
      if (!hdmi && !dp && !miniDp && !altMode) return null;
      const ports = [
        ...(yes(hdmi) ? ["hdmi"] : []),
        ...(positive(dp) || positive(miniDp) ? ["dp"] : []),
        ...(yes(altMode) ? ["usb-c"] : []),
      ];
      const raw = [hdmi, dp, miniDp, altMode]
        .filter((f): f is Feature => !!f)
        .map((f) => `${f.name}: ${f.presentation}`)
        .join("; ");
      return { raw, text: ports.join(", ") };
    },
  },
  flag("desk.height_adjustable", { name: /^Height adjustable$/i }),
  measure("desk.width", { name: /^Width$/i }),
  measure("desk.depth", { name: /^Depth$/i }),
  measure("chair.max_load", { name: /^Maximum (?:weight|load) capacity$/i }),
  measure("cable.usb_pd_watts", {
    name: /^(?:USB )?Power Delivery(?: \(PD\))?(?: up to)?$/i,
  }),
  measure("power_bank.capacity_mah", { name: /^Battery capacity$/i }),
];

export type IcecatClaimOptions = {
  packs: readonly Pack[];
  roles?: readonly string[];
};

/** Manufacturer claims from one spec sheet, limited to the product's roles. */
export function icecatClaims(
  sheet: IcecatSheet,
  opts: IcecatClaimOptions,
): ClaimedFact[] {
  const fs = features(sheet);
  const category = sheet.GeneralInfo.Category?.Name?.Value ?? "";
  const roles = opts.roles?.length
    ? opts.roles
    : inferRoles(category, sheet.GeneralInfo.Title);
  const packs = packsForRoles(opts.packs, roles);
  const roleNames = new Set(
    opts.packs.flatMap((p) => p.roles.map((r) => r.role)),
  );
  const out: ClaimedFact[] = [];
  for (const m of ICECAT_MAPPINGS) {
    if (!fieldAppliesTo(m.field, roles, roleNames)) continue;
    const def = fieldDef(m.field, packs);
    if (!def) continue;
    const read = m.read(fs);
    if (!read) continue;
    const value: Value | null = read.text ? readAs(read.text, def) : null;
    out.push(
      claim(m.field, value, read.raw, SOURCE_AUTHORITY.icecat, def, "icecat"),
    );
  }
  return out;
}

export type IcecatIdentity = {
  brand?: string;
  mpn?: string;
  title?: string;
  category?: string;
  gtins: string[];
};

export function icecatIdentity(sheet: IcecatSheet): IcecatIdentity {
  const g = sheet.GeneralInfo;
  const gtins = [
    ...new Set(
      (g.GTIN ?? []).map(normalizeGtin).filter((x): x is string => !!x),
    ),
  ];
  return {
    ...(g.Brand ? { brand: g.Brand } : {}),
    ...(g.BrandPartCode ? { mpn: g.BrandPartCode } : {}),
    ...(g.Title ? { title: g.Title } : {}),
    ...(g.Category?.Name?.Value ? { category: g.Category.Name.Value } : {}),
    gtins,
  };
}

export type IcecatOptions = {
  store: SnapshotStore;
  username: string;
  apiToken?: string;
  fetch?: FetchLike;
  language?: string;
  /** Default 30 d: manufacturer specs change rarely (SDD §11.4). */
  cacheTtlMs?: number;
  timeoutMs?: number;
  now?: () => Date;
};

export type IcecatResult = { source: Snapshot; sheet: IcecatSheet | null };

export function createIcecat(opts: IcecatOptions) {
  if (!opts.username.trim())
    throw new SourceError(
      LABEL,
      "not_configured",
      "ICECAT_USERNAME is not set",
    );
  const lang = opts.language ?? "en";

  async function get(params: string): Promise<IcecatResult> {
    const url = `${ICECAT_API}?UserName=${encodeURIComponent(opts.username)}&Language=${lang}&${params}`;
    const source = await cachedFetch(
      {
        // The username is part of the URL Icecat expects; the token travels in a header and is never recorded.
        key: url,
        sourceType: "icecat",
        ttlMs: opts.cacheTtlMs ?? 30 * 86_400_000,
        ...(opts.now ? { now: opts.now } : {}),
        fetch: () =>
          httpRequest({
            source: LABEL,
            url,
            headers: {
              Accept: "application/json",
              ...(opts.apiToken ? { "api-token": opts.apiToken } : {}),
            },
            ...(opts.fetch ? { fetch: opts.fetch } : {}),
            ...(opts.timeoutMs ? { timeoutMs: opts.timeoutMs } : {}),
            ...(opts.now ? { now: opts.now } : {}),
          }),
      },
      opts.store,
    );
    const status = source.httpStatus ?? 0;
    if (status === 404) return { source, sheet: null };
    const body = parseJsonBody(LABEL, source.bytes) as {
      msg?: string;
      message?: string;
      data?: IcecatSheet;
    };
    if (status >= 400 || body.msg !== "OK" || !body.data?.GeneralInfo) {
      // Icecat answers an unknown product with a 4xx/`msg` explaining why; that's "no sheet", not an outage.
      if (
        status === 400 ||
        status === 403 ||
        status === 404 ||
        /not found|no product|not present/i.test(
          `${body.message ?? body.msg ?? ""}`,
        )
      ) {
        return { source, sheet: null };
      }
      throw new SourceError(
        LABEL,
        "http",
        body.message ?? body.msg ?? `HTTP ${status}`,
        status || undefined,
      );
    }
    return { source, sheet: body.data };
  }

  return {
    label: LABEL,
    byGtin(gtin: string): Promise<IcecatResult> {
      const g = normalizeGtin(gtin);
      if (!g)
        throw new SourceError(LABEL, "invalid_response", "not a valid GTIN");
      // Icecat indexes the GTIN-13 / UPC form; a GTIN-14 with a leading zero is found by its 13-digit form.
      return get(`GTIN=${g.replace(/^0/, "")}`);
    },
    byBrandCode(brand: string, productCode: string): Promise<IcecatResult> {
      return get(
        `Brand=${encodeURIComponent(brand)}&ProductCode=${encodeURIComponent(productCode)}`,
      );
    },
  };
}
