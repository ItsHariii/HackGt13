import {
  AlertTriangle,
  Repeat,
  Store as StoreIcon,
  Truck,
  Undo2,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CategoryIcon } from "@/components/category-icon";
import { getActiveRecalls, getProduct, getStorePolicies } from "@/lib/catalog";
import { pageOrigin } from "@/lib/config";
import { productJsonLd, serializeJsonLd } from "@/lib/jsonld";
import {
  AVAILABILITY_LABEL,
  DEPARTMENTS,
  deliveryLabel,
  returnLabel,
} from "@/lib/labels";
import { formatMinor } from "@/lib/money";

export const dynamic = "force-dynamic";

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
  const [policies, recalls] = await Promise.all([
    getStorePolicies(),
    getActiveRecalls([variant.sku]),
  ]);
  const origin = await pageOrigin();
  const url = `${origin}/p/${product.slug}?sku=${encodeURIComponent(variant.sku)}`;
  const o = variant.offer;
  const jsonLd = productJsonLd(product, variant, {
    url,
    shippingFlatMinor: policies.shipping.flatMinor,
    variantCount: product.variants.length,
  });

  return (
    <main className="pdp">
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD is escaped by serializeJsonLd.
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />
      <nav aria-label="Breadcrumb" className="crumbs">
        <Link href="/">Shop</Link> /{" "}
        <Link href={`/?d=${product.department}`}>
          {DEPARTMENTS[product.department]}
        </Link>{" "}
        / <span aria-current="page">{product.name}</span>
      </nav>
      <div className="pdp-grid">
        <div className={`pdp-art product-art tone-${product.department}`}>
          <span>{product.category.toUpperCase()}</span>
          <CategoryIcon
            category={product.category}
            department={product.department}
            size={180}
          />
        </div>
        <div className="pdp-buy">
          <p className="brand">{product.brand}</p>
          <h1>{variant.title}</h1>
          <p className="lede">{product.description}</p>
          <p className="price">
            {formatMinor(o.priceMinor)}
            {o.subscription ? (
              <span className="tag">
                <Repeat size={13} aria-hidden="true" /> Renews{" "}
                {o.subscription.every.replace(/^P(\d+)D$/, "every $1 days")} at{" "}
                {formatMinor(o.subscription.priceMinor)}
              </span>
            ) : null}
            {o.finalSale ? <span className="tag warn">Final sale</span> : null}
          </p>

          {product.variants.length > 1 ? (
            <fieldset className="options">
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

          {recalls.length > 0 ? (
            <div className="alert" role="alert">
              <AlertTriangle size={16} aria-hidden="true" />
              <div>
                <strong>
                  Recall {recalls[0]?.recall_number} (Mock CPSC, demo)
                </strong>
                <p>{recalls[0]?.hazard}</p>
              </div>
            </div>
          ) : null}
          {variant.shipsAs ? (
            <div className="alert" role="note">
              <AlertTriangle size={16} aria-hidden="true" />
              <div>
                <strong>Ships as {variant.shipsAs.sku}</strong>
                <p>
                  This listing currently fulfills with GTIN{" "}
                  {variant.shipsAs.gtin}.
                </p>
              </div>
            </div>
          ) : null}

          <dl className="facts">
            <div>
              <dt>
                <Truck size={15} aria-hidden="true" /> Delivery
              </dt>
              <dd>
                {deliveryLabel(o.deliveryMinDays, o.deliveryMaxDays)} ·{" "}
                {policies.shipping.label}{" "}
                {formatMinor(policies.shipping.flatMinor + o.shippingFeeMinor)}{" "}
                per order
                {o.shippingFeeMinor > 0
                  ? ` (includes ${formatMinor(o.shippingFeeMinor)} handling)`
                  : ""}
              </dd>
            </div>
            <div>
              <dt>
                <Undo2 size={15} aria-hidden="true" /> Returns
              </dt>
              <dd>{returnLabel(o.returnPolicy.terms)}</dd>
            </div>
            <div>
              <dt>
                <StoreIcon size={15} aria-hidden="true" /> Sold by
              </dt>
              <dd>{o.seller.name}</dd>
            </div>
            <div>
              <dt>Availability</dt>
              <dd className={`stock-${o.availability}`}>
                {AVAILABILITY_LABEL[o.availability]}
                {o.availability !== "out_of_stock" ? ` · ${o.stock} left` : ""}
                {o.packSize > 1 ? ` · pack of ${o.packSize}` : ""}
              </dd>
            </div>
          </dl>
          <p className="agent-note">
            Checkout on GreatHub is agent-only: signed ACP requests from Cartel.
            There is no cart for people.
          </p>
        </div>
      </div>

      <section className="pdp-section" aria-labelledby="spec-title">
        <h2 id="spec-title">Specifications</h2>
        <table className="spec">
          <tbody>
            {variant.spec.map((s) => (
              <tr key={s.name}>
                <th scope="row">{s.name}</th>
                <td>{s.value}</td>
              </tr>
            ))}
            <tr>
              <th scope="row">SKU</th>
              <td className="mono">{variant.sku}</td>
            </tr>
            <tr>
              <th scope="row">GTIN</th>
              <td className="mono">{variant.gtin}</td>
            </tr>
            <tr>
              <th scope="row">MPN</th>
              <td className="mono">{variant.mpn}</td>
            </tr>
          </tbody>
        </table>
        <p className="fine">
          Listing revision {o.revision} · updated{" "}
          {new Date(o.updatedAt).toLocaleString("en-US", { timeZone: "UTC" })}{" "}
          UTC
        </p>
      </section>

      {variant.injectionText ? (
        <section className="pdp-section" aria-labelledby="seller-note">
          <h2 id="seller-note">From the seller</h2>
          <p className="seller-note">{variant.injectionText}</p>
        </section>
      ) : null}
    </main>
  );
}
