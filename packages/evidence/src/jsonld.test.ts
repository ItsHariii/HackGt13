import { apparel, homeOffice, travel } from "@cartel/rule-packs";
import { describe, expect, it } from "vitest";
import {
  jsonLdBlocks,
  jsonLdClaims,
  jsonLdProducts,
  pageClaims,
} from "./jsonld";

const PACKS = [homeOffice, apparel, travel];

const monitor = {
  "@context": "https://schema.org",
  "@type": "Product",
  name: "Vireo U2727 27-inch 4K USB-C Monitor",
  sku: "VIREO-U2727",
  gtin14: "00812345000016",
  color: "Black",
  additionalProperty: [
    { "@type": "PropertyValue", name: "Screen size", value: '27"' },
    { "@type": "PropertyValue", name: "Resolution", value: "UHD" },
    {
      "@type": "PropertyValue",
      name: "USB-C power delivery",
      value: "up to 90 W",
    },
    {
      "@type": "PropertyValue",
      name: "Video inputs",
      value: "HDMI 2.0, DisplayPort 1.4, USB-C DP Alt",
    },
  ],
  offers: { "@type": "Offer", price: "329.00", priceCurrency: "USD" },
};

const page = (...blocks: string[]) =>
  `<!doctype html><html><head>${blocks.map((b) => `<script type="application/ld+json">${b}</script>`).join("")}</head><body>Test merchant</body></html>`;

describe("JSON-LD blocks", () => {
  it("parses every block, skips broken ones, and finds products inside @graph", () => {
    const html = page(
      "{ not json",
      JSON.stringify({
        "@context": "https://schema.org",
        "@graph": [{ "@type": "BreadcrumbList" }, monitor],
      }),
      JSON.stringify([
        { "@type": ["Product", "IndividualProduct"], name: "Second" },
      ]),
    );
    const blocks = jsonLdBlocks(html);
    expect(blocks).toHaveLength(2);
    expect(jsonLdProducts(blocks).map((p) => p.name)).toEqual([
      monitor.name,
      "Second",
    ]);
  });

  it("accepts single-quoted and unquoted type attributes", () => {
    const html = `<script type='application/ld+json'>{"@type":"Product","name":"A"}</script><SCRIPT TYPE=application/ld+json>{"@type":"Product","name":"B"}</SCRIPT>`;
    expect(jsonLdProducts(jsonLdBlocks(html)).map((p) => p.name)).toEqual([
      "A",
      "B",
    ]);
  });
});

describe("JSON-LD claims", () => {
  it("reads a monitor's specs as merchant claims (source_stated), never verified", () => {
    const claims = jsonLdClaims(monitor, { packs: PACKS, roles: ["monitor"] });
    const by = Object.fromEntries(claims.map((c) => [c.field, c]));
    expect(by["monitor.usb_c_pd_watts"]).toMatchObject({
      value: { value: 90, unit: "W", qualifier: "up_to" },
      raw: "up to 90 W",
      state: "source_stated",
      extractor: "jsonld",
    });
    expect(by["monitor.diagonal"]?.value).toEqual({ value: 27, unit: "in" });
    expect(by["monitor.resolution"]?.value).toBe("4k");
    expect(by["monitor.video_in"]?.value).toEqual([
      "HDMI 2.0",
      "DisplayPort 1.4",
      "USB-C DP Alt",
    ]);
    expect(claims.every((c) => c.state !== "verified")).toBe(true);
  });

  it("never reads a monitor with another role's or another pack's fields", () => {
    const fields = jsonLdClaims(monitor, {
      packs: PACKS,
      roles: ["monitor"],
    }).map((c) => c.field);
    expect(fields).not.toContain("webcam.resolution");
    expect(fields).not.toContain("garment.color");
    expect(fields.every((f) => f.startsWith("monitor."))).toBe(true);
  });

  it("keeps unreadable text as a no-fact claim so the drawer can show it", () => {
    const odd = {
      ...monitor,
      additionalProperty: [{ name: "USB-C power delivery", value: "plenty" }],
    };
    const [c] = jsonLdClaims(odd, { packs: PACKS, roles: ["monitor"] });
    expect(c).toEqual({
      field: "monitor.usb_c_pd_watts",
      value: null,
      raw: "plenty",
      state: "unknown",
      reason: "no_fact",
      extractor: "jsonld",
    });
  });

  it("the same-SKU spec edit is visible as a different claim", () => {
    const edited = {
      ...monitor,
      additionalProperty: monitor.additionalProperty.map((p) =>
        p.name === "USB-C power delivery" ? { ...p, value: "15 W" } : p,
      ),
    };
    const pd = pageClaims(page(JSON.stringify(edited)), {
      packs: PACKS,
      roles: ["monitor"],
    }).claims.find((c) => c.field === "monitor.usb_c_pd_watts");
    expect(pd?.value).toEqual({ value: 15, unit: "W" });
  });

  it("returns no claims for a page without a Product", () => {
    expect(
      pageClaims(page(JSON.stringify({ "@type": "WebPage" })), {
        packs: PACKS,
      }),
    ).toEqual({ product: null, claims: [] });
  });
});
