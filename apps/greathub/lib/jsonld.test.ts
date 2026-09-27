import { describe, expect, it } from "vitest";
import type { ProductSummary, VariantView } from "./catalog";
import { productJsonLd, serializeJsonLd } from "./jsonld";

const product: ProductSummary = {
  id: "p1",
  slug: "vireo-u2727",
  brand: "Vireo",
  name: "Vireo U2727",
  department: "home_office",
  category: "monitors",
  roles: ["monitor"],
  description: "A monitor.",
};
const variant: VariantView = {
  listingId: "dm_lst_u2727",
  sku: "U2727",
  gtin: "00812345000030",
  mpn: "VR-U2727-BK",
  optionLabel: null,
  title: 'Vireo U2727 27" 4K USB-C Monitor',
  spec: [{ name: "USB-C power delivery", value: "Up to 90 W" }],
  jsonldSpec: [{ name: "USB-C power delivery", value: "Up to 90 W" }],
  injectionText: null,
  shipsAs: null,
  offer: {
    id: "dm_off_48300",
    priceMinor: 32900,
    currency: "USD",
    availability: "in_stock",
    stock: 22,
    deliveryMinDays: 1,
    deliveryMaxDays: 2,
    finalSale: false,
    packSize: 1,
    subscription: null,
    shippingFeeMinor: 0,
    revision: 1,
    updatedAt: "2026-09-26T14:00:00Z",
    seller: { id: "dm_seller_1", name: "GreatHub" },
    returnPolicy: {
      id: "ret_30_free",
      name: "30-day free returns",
      terms: {
        returnable: true,
        windowDays: 30,
        feeMinor: 0,
        finalSale: false,
      },
    },
  },
};
const opts = {
  url: "http://localhost:3001/p/vireo-u2727?sku=U2727",
  shippingFlatMinor: 2400,
  variantCount: 1,
};

describe("productJsonLd", () => {
  it("emits schema.org Product + Offer with exact decimal prices", () => {
    const ld = productJsonLd(product, variant, opts);
    expect(ld).toMatchObject({
      "@type": "Product",
      sku: "U2727",
      gtin14: "00812345000030",
      brand: { name: "Vireo" },
      additionalProperty: [
        {
          "@type": "PropertyValue",
          name: "USB-C power delivery",
          value: "Up to 90 W",
        },
      ],
      offers: {
        "@type": "Offer",
        price: "329.00",
        priceCurrency: "USD",
        availability: "https://schema.org/InStock",
        shippingDetails: { shippingRate: { value: "24.00" } },
        hasMerchantReturnPolicy: {
          returnPolicyCategory:
            "https://schema.org/MerchantReturnFiniteReturnWindow",
          merchantReturnDays: 30,
          returnFees: "https://schema.org/FreeReturn",
        },
      },
    });
  });
  it("marks final sale as returns not permitted", () => {
    const ld = productJsonLd(
      product,
      {
        ...variant,
        offer: {
          ...variant.offer,
          finalSale: true,
          returnPolicy: {
            id: "final_sale",
            name: "Final sale",
            terms: {
              returnable: false,
              windowDays: 0,
              feeMinor: 0,
              finalSale: true,
            },
          },
        },
      },
      opts,
    );
    expect(ld.offers.hasMerchantReturnPolicy).toMatchObject({
      returnPolicyCategory: "https://schema.org/MerchantReturnNotPermitted",
    });
    expect(ld.offers.hasMerchantReturnPolicy).not.toHaveProperty(
      "merchantReturnDays",
    );
  });
  it("uses the JSON-LD spec, not the visible one, after a jsonld_conflict", () => {
    const ld = productJsonLd(
      product,
      {
        ...variant,
        jsonldSpec: [{ name: "USB-C power delivery", value: "100 W" }],
      },
      opts,
    );
    expect(ld.additionalProperty[0]?.value).toBe("100 W");
  });
});

describe("serializeJsonLd", () => {
  it("cannot be broken out of by listing text", () => {
    const hostile = {
      description: "</script><script>alert(1)</script> & more",
    };
    const out = serializeJsonLd(hostile);
    expect(out).not.toContain("</script>");
    expect(out).not.toContain("<");
    expect(JSON.parse(out)).toEqual(hostile);
  });
  it("escapes the JavaScript line separators", () => {
    const text = `a${String.fromCodePoint(0x2028)}b${String.fromCodePoint(0x2029)}c`;
    const out = serializeJsonLd({ text });
    expect(out).not.toContain(String.fromCodePoint(0x2028));
    expect(JSON.parse(out)).toEqual({ text });
  });
});
