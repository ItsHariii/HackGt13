import Link from "next/link";
import { CategoryIcon } from "@/components/category-icon";
import { listProducts, type ProductView } from "@/lib/catalog";
import { AVAILABILITY_LABEL, DEPARTMENTS, deliveryLabel } from "@/lib/labels";
import { formatMinor } from "@/lib/money";

export const dynamic = "force-dynamic";

type Department = keyof typeof DEPARTMENTS;

function priceLabel(p: ProductView) {
  const prices = p.variants.map((v) => v.offer.priceMinor);
  const min = Math.min(...prices);
  return prices.some((x) => x !== min)
    ? `From ${formatMinor(min)}`
    : formatMinor(min);
}

function stockOf(p: ProductView) {
  if (p.variants.every((v) => v.offer.availability === "out_of_stock"))
    return "out_of_stock" as const;
  if (p.variants.some((v) => v.offer.availability === "limited"))
    return "limited" as const;
  return "in_stock" as const;
}

export default async function Home({ searchParams }: PageProps<"/">) {
  const { d } = await searchParams;
  const department =
    typeof d === "string" && d in DEPARTMENTS ? (d as Department) : null;
  const products = (await listProducts()).filter((p) => p.variants.length > 0);
  const shown = department
    ? products.filter((p) => p.department === department)
    : products;

  return (
    <main>
      <section className="merchant-hero compact">
        <div>
          <p className="eyebrow">EVERYDAY THINGS. THOUGHTFULLY PICKED.</p>
          <h1>
            Good things.
            <br />
            <span>Honest listings.</span>
          </h1>
          <p>
            {products.length} fictional products across home office, apparel and
            travel. Agents buy through our ACP checkout; people just browse.
          </p>
        </div>
      </section>
      <section
        id="collection"
        className="collection"
        aria-labelledby="collection-title"
      >
        <div className="collection-heading">
          <div>
            <p className="eyebrow">THE CATALOG</p>
            <h2 id="collection-title">
              {department ? DEPARTMENTS[department] : "Everything"}
            </h2>
          </div>
          <nav aria-label="Departments" className="chips">
            <Link
              href="/"
              aria-current={department === null ? "page" : undefined}
            >
              All <span>{products.length}</span>
            </Link>
            {(Object.keys(DEPARTMENTS) as Department[]).map((key) => (
              <Link
                key={key}
                href={`/?d=${key}`}
                aria-current={department === key ? "page" : undefined}
              >
                {DEPARTMENTS[key]}{" "}
                <span>
                  {products.filter((p) => p.department === key).length}
                </span>
              </Link>
            ))}
          </nav>
        </div>
        <ul className="product-grid">
          {shown.map((p) => {
            const first = p.variants[0];
            const stock = stockOf(p);
            return (
              <li key={p.id} className="product-card">
                <Link href={`/p/${p.slug}`}>
                  <div className={`product-art tone-${p.department}`}>
                    <span>{p.category.toUpperCase()}</span>
                    <CategoryIcon
                      category={p.category}
                      department={p.department}
                    />
                  </div>
                  <div className="product-info">
                    <p className="brand">{p.brand}</p>
                    <h3>{p.name}</h3>
                    <p>{p.description}</p>
                    <div>
                      <strong>{priceLabel(p)}</strong>
                      <span className={`stock stock-${stock}`}>
                        {AVAILABILITY_LABEL[stock]}
                      </span>
                    </div>
                    {first ? (
                      <p className="fine">
                        {deliveryLabel(
                          first.offer.deliveryMinDays,
                          first.offer.deliveryMaxDays,
                        )}
                        {p.variants.length > 1
                          ? ` · ${p.variants.length} options`
                          : ""}
                      </p>
                    ) : null}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
    </main>
  );
}
