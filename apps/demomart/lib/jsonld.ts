// schema.org Product + Offer JSON-LD for a variant page (T6.1). ProofCart reads
// facts from this exactly as it would from a real store, so it must match the
// visible page — except after a jsonld_conflict mutation, which is the point.

import type { ProductSummary, VariantView } from "./catalog";
import { decimalMinor } from "./money";

const AVAILABILITY = {
  in_stock: "https://schema.org/InStock",
  limited: "https://schema.org/LimitedAvailability",
  out_of_stock: "https://schema.org/OutOfStock",
} as const;

function money(amountMinor: number, currency: string) {
  return {
    "@type": "MonetaryAmount",
    value: decimalMinor(amountMinor),
    currency,
  };
}

export function productJsonLd(
  product: ProductSummary,
  variant: VariantView,
  opts: { url: string; shippingFlatMinor: number; variantCount: number },
) {
  const { offer } = variant;
  const terms = offer.returnPolicy.terms;
  const description = variant.injectionText
    ? `${product.description}\n\n${variant.injectionText}`
    : product.description;
  const additionalProperty = [
    ...variant.jsonldSpec.map((s) => ({
      "@type": "PropertyValue",
      name: s.name,
      value: s.value,
    })),
    ...(offer.packSize > 1 &&
    !variant.jsonldSpec.some((s) => s.name.toLowerCase() === "pack size")
      ? [
          {
            "@type": "PropertyValue",
            name: "Pack size",
            value: String(offer.packSize),
          },
        ]
      : []),
  ];
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: variant.title,
    description,
    url: opts.url,
    sku: variant.sku,
    mpn: variant.mpn,
    gtin14: variant.gtin,
    category: product.category,
    brand: { "@type": "Brand", name: product.brand },
    ...(opts.variantCount > 1
      ? {
          isVariantOf: {
            "@type": "ProductGroup",
            productGroupID: product.slug,
            name: product.name,
          },
        }
      : {}),
    additionalProperty,
    offers: {
      "@type": "Offer",
      url: opts.url,
      sku: variant.sku,
      price: decimalMinor(offer.priceMinor),
      priceCurrency: offer.currency,
      availability: AVAILABILITY[offer.availability],
      itemCondition: "https://schema.org/NewCondition",
      inventoryLevel: { "@type": "QuantitativeValue", value: offer.stock },
      seller: {
        "@type": "Organization",
        name: offer.seller.name,
        identifier: offer.seller.id,
      },
      ...(offer.subscription
        ? {
            priceSpecification: {
              "@type": "UnitPriceSpecification",
              price: decimalMinor(offer.subscription.priceMinor),
              priceCurrency: offer.currency,
              billingDuration: offer.subscription.every,
            },
          }
        : {}),
      shippingDetails: {
        "@type": "OfferShippingDetails",
        shippingRate: money(
          opts.shippingFlatMinor + offer.shippingFeeMinor,
          offer.currency,
        ),
        shippingDestination: { "@type": "DefinedRegion", addressCountry: "US" },
        deliveryTime: {
          "@type": "ShippingDeliveryTime",
          handlingTime: {
            "@type": "QuantitativeValue",
            minValue: 0,
            maxValue: 0,
            unitCode: "DAY",
          },
          transitTime: {
            "@type": "QuantitativeValue",
            minValue: offer.deliveryMinDays,
            maxValue: offer.deliveryMaxDays,
            unitCode: "DAY",
          },
        },
      },
      hasMerchantReturnPolicy: {
        "@type": "MerchantReturnPolicy",
        name: offer.returnPolicy.name,
        applicableCountry: "US",
        ...(terms.returnable && !terms.finalSale
          ? {
              returnPolicyCategory:
                "https://schema.org/MerchantReturnFiniteReturnWindow",
              merchantReturnDays: terms.windowDays,
              returnMethod: "https://schema.org/ReturnByMail",
              ...(terms.feeMinor > 0
                ? {
                    returnFees:
                      "https://schema.org/ReturnFeesCustomerResponsibility",
                    returnShippingFeesAmount: money(
                      terms.feeMinor,
                      offer.currency,
                    ),
                  }
                : { returnFees: "https://schema.org/FreeReturn" }),
            }
          : {
              returnPolicyCategory:
                "https://schema.org/MerchantReturnNotPermitted",
            }),
      },
    },
  };
}

/**
 * JSON for a `<script type="application/ld+json">`. Escapes `<`, `>` and `&`
 * (and the JS line separators) so listing text can never close the script tag.
 */
export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
