import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CategoryIcon } from "@/components/category-icon";
import { GHFigure } from "@/components/gh/figure";
import { Check, Cross, Lock } from "@/components/gh/icons";
import { type SpecRow, SpecsPanel } from "@/components/gh/specs-panel";
import {
  getActiveRecalls,
  getProduct,
  getSeededSpecs,
  getStorePolicies,
} from "@/lib/catalog";
import { ago, catchHash, catchMessage } from "@/lib/catches";
import { pageOrigin } from "@/lib/config";
import { latestBySku, recentCatches } from "@/lib/harbor";
import { productJsonLd, serializeJsonLd } from "@/lib/jsonld";
import { AVAILABILITY_LABEL, deliveryLabel, returnLabel } from "@/lib/labels";
import { formatMinor } from "@/lib/money";

export const dynamic = "force-dynamic";

const TOPIC: Record<string, string> = {
  home_office: "home-office",
  apparel: "apparel",
  travel: "travel",
  grocery: "grocery",
  party: "party",
};

export async function generateMetadata({
  params,
}: PageProps<"/p/[slug]">): Promise<Metadata> {
  const product = await getProduct((await params).slug);
  return product
    ? { title: product.name, description: product.description }
    : { title: "Not found" };
}

export default async function ProductPage({
  params,
  searchParams,
}: PageProps<"/p/[slug]">) {
  const [{ slug }, { sku }] = await Promise.all([params, searchParams]);
  const product = await getProduct(slug);
  if (!product || product.variants.length === 0) notFound();
  const variant =
    product.variants.find((v) => v.sku === sku) ?? product.variants[0];
  if (!variant) notFound();
  const [policies, recalls, seeded, catches] = await Promise.all([
    getStorePolicies(),
    getActiveRecalls([variant.sku]),
    getSeededSpecs(),
    recentCatches(50),
  ]);
  const origin = await pageOrigin();
  const url = `${origin}/p/${product.slug}?sku=${encodeURIComponent(variant.sku)}`;
  const o = variant.offer;
  const jsonLd = productJsonLd(product, variant, {
    url,
    shippingFlatMinor: policies.shipping.flatMinor,
    variantCount: product.variants.length,
  });
  const seed = seeded.get(variant.listingId);
  const rows: SpecRow[] = [
    ...variant.spec.map((s) => ({
      name: s.name,
      value: s.value,
      changed:
        seed !== undefined &&
        seed.find((x) => x.name === s.name)?.value !== s.value,
    })),
    { name: "SKU", value: variant.sku, changed: false },
    { name: "GTIN", value: variant.gtin, changed: false },
    { name: "MPN", value: variant.mpn, changed: false },
  ];
  const lastCatch = latestBySku(catches).get(variant.sku);
  const returns = returnLabel(o.returnPolicy.terms);

  return (
    <main className="gh-page">
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD is escaped by serializeJsonLd.
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />
      <div className="gh-pathbar">
        <nav aria-label="Breadcrumb" className="gh-crumbs gh-crumbs-lg">
          <Link href="/">greathub</Link>
          <span aria-hidden="true">/</span>
          <Link href="/">the-workday-edit</Link>
          <span aria-hidden="true">/</span>
          <Link href={`/?d=${product.department}`}>
            {TOPIC[product.department] ?? product.department}
          </Link>
          <span aria-hidden="true">/</span>
          <strong aria-current="page">{product.slug}</strong>
        </nav>
        <span className="gh-code gh-muted gh-pathbar-catch">
          {lastCatch
            ? `last catch ${catchHash(lastCatch.id)} · ${catchMessage(lastCatch)} · ${ago(lastCatch.created_at)}`
            : `listing revision ${o.revision} · docked ${new Date(o.updatedAt).toLocaleDateString("en-US", { timeZone: "UTC" })}`}
        </span>
      </div>

      <div className="gh-pdp">
        <div className="gh-porthole-frame">
          <div className="gh-porthole">
            <span className="gh-rivet top" />
            <span className="gh-rivet bottom" />
            <span className="gh-rivet left" />
            <span className="gh-rivet right" />
            <div className="gh-porthole-glass">
              <CategoryIcon
                category={product.category}
                department={product.department}
                size={150}
              />
              <span className="gh-code">
                {product.brand} · {product.category}
              </span>
            </div>
          </div>
        </div>

        <div className="gh-pdp-buy">
          <p className="gh-brandline">{product.brand}</p>
          <h1>{variant.title}</h1>
          <p className="gh-code gh-price">{formatMinor(o.priceMinor)}</p>
          {o.subscription ? (
            <p className="gh-flag">
              Renews{" "}
              {o.subscription.every.replace(/^P(\d+)D$/, "every $1 days")} at{" "}
              {formatMinor(o.subscription.priceMinor)}
            </p>
          ) : null}

          {product.variants.length > 1 ? (
            <fieldset className="gh-options">
              <legend>Options</legend>
              {product.variants.map((v) => (
                <Link
                  key={v.sku}
                  href={`/p/${product.slug}?sku=${encodeURIComponent(v.sku)}`}
                  aria-current={v.sku === variant.sku ? "true" : undefined}
                  scroll={false}
                >
                  {v.optionLabel ?? v.sku}
                </Link>
              ))}
            </fieldset>
          ) : null}

          <ul className="gh-facts">
            <li className={`stock-${o.availability}`}>
              {o.availability === "out_of_stock" ? (
                <Cross size={16} />
              ) : (
                <Check size={18} />
              )}
              {AVAILABILITY_LABEL[o.availability]}
              {o.availability !== "out_of_stock" ? ` · ${o.stock} left` : ""}
              {" · "}
              {deliveryLabel(o.deliveryMinDays, o.deliveryMaxDays)}
              {o.packSize > 1 ? ` · pack of ${o.packSize}` : ""}
            </li>
            <li>
              Sold by <strong>{o.seller.name}</strong>
            </li>
            <li>
              {returns}
              {o.finalSale ? "" : " · not final sale"}
            </li>
            <li>
              {policies.shipping.label}{" "}
              {formatMinor(policies.shipping.flatMinor + o.shippingFeeMinor)}{" "}
              per order
              {o.shippingFeeMinor > 0
                ? ` (includes ${formatMinor(o.shippingFeeMinor)} handling)`
                : ""}
            </li>
          </ul>

          {recalls.length > 0 ? (
            <div className="gh-alert" role="alert">
              <strong>
                Recall {recalls[0]?.recall_number} (Mock CPSC, demo)
              </strong>
              <p>{recalls[0]?.hazard}</p>
            </div>
          ) : null}
          {variant.shipsAs ? (
            <div className="gh-alert" role="note">
              <strong>Ships as {variant.shipsAs.sku}</strong>
              <p>
                This listing currently fulfills with GTIN{" "}
                <span className="gh-code">{variant.shipsAs.gtin}</span>.
              </p>
            </div>
          ) : null}

          <div className="gh-hold">
            <button type="button" disabled className="gh-btn gh-btn-disabled">
              <Lock size={18} />
              Load the hold
            </button>
            <p>
              Checkout at GreatHub happens through signed AI agents (ACP).
              Humans: enjoy the view.
            </p>
          </div>
        </div>
      </div>

      <div className="gh-pdp-lower">
        <div className="gh-pdp-lower-main">
          <SpecsPanel rows={rows} />
          <p className="gh-fine">{product.description}</p>
          {variant.injectionText ? (
            <section
              className="gh-card gh-bottle"
              aria-labelledby="seller-note"
            >
              <h2 id="seller-note" className="gh-h4">
                From the seller
              </h2>
              <p>{variant.injectionText}</p>
            </section>
          ) : null}
        </div>
        <aside className="gh-pdp-aside">
          <p className="gh-bubble">
            Every spec here matches our machine-readable listing. Unless the
            Gull&apos;s been at it.
          </p>
          <GHFigure pose="point" flip className="gh-pdp-figure" />
        </aside>
      </div>
    </main>
  );
}
