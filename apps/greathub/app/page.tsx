import { cookies } from "next/headers";
import Link from "next/link";
import { CategoryIcon } from "@/components/category-icon";
import { GHFigure } from "@/components/gh/figure";
import {
  Crate,
  Dock,
  Fishhook,
  Logbook,
  Starfish,
} from "@/components/gh/icons";
import { ProductCard } from "@/components/gh/product-card";
import { TideChart } from "@/components/gh/tide-chart";
import { ViewToggle } from "@/components/gh/view-toggle";
import { listProducts, type ProductView } from "@/lib/catalog";
import { ago, catchAuthor, catchHash, catchMessage } from "@/lib/catches";
import { latestBySku, recentCatches, tideCounts } from "@/lib/harbor";
import { AVAILABILITY_LABEL, DEPARTMENTS } from "@/lib/labels";
import {
  type CatalogView,
  parseView,
  priceLabel,
  stockOf,
  unitsHeld,
  VIEW_COOKIE,
} from "@/lib/shelf";

export const dynamic = "force-dynamic";

type Department = keyof typeof DEPARTMENTS;
const TOPIC: Record<Department, string> = {
  home_office: "home-office",
  apparel: "apparel",
  travel: "travel",
  grocery: "grocery",
  party: "party",
};

function matches(p: ProductView, q: string) {
  const hay = `${p.brand} ${p.name} ${p.category} ${p.variants
    .map((v) => `${v.sku} ${v.title}`)
    .join(" ")}`.toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => hay.includes(w));
}

export default async function Home({ searchParams }: PageProps<"/">) {
  const { d, q, view: viewParam } = await searchParams;
  const department =
    typeof d === "string" && d in DEPARTMENTS ? (d as Department) : null;
  const query = typeof q === "string" ? q.trim() : "";
  const view: CatalogView =
    parseView(viewParam) ??
    parseView((await cookies()).get(VIEW_COOKIE)?.value) ??
    "list";
  const full = view === "full";
  const hrefFor = (next: CatalogView) => {
    const params = new URLSearchParams();
    if (department) params.set("d", department);
    if (query) params.set("q", query);
    params.set("view", next);
    return `/?${params}#catalog`;
  };
  const [products, catches, tide] = await Promise.all([
    listProducts().then((all) => all.filter((p) => p.variants.length > 0)),
    recentCatches(50),
    tideCounts(140),
  ]);
  const latest = latestBySku(catches);
  const newest = catches[0];
  const shown = products.filter(
    (p) =>
      (!department || p.department === department) &&
      (!query || matches(p, query)),
  );
  const units = products.reduce((n, p) => n + unitsHeld(p), 0);
  const heading = query
    ? `“${query}”`
    : department
      ? DEPARTMENTS[department]
      : "Catalog";

  return (
    <main className="gh-page">
      <div className="gh-dockbar">
        <Dock size={20} />
        <nav aria-label="Breadcrumb" className="gh-crumbs gh-crumbs-lg">
          <Link href="/">greathub</Link>
          <span aria-hidden="true">/</span>
          <Link href="/" aria-current={department ? undefined : "page"}>
            the-workday-edit
          </Link>
          {department ? (
            <>
              <span aria-hidden="true">/</span>
              <strong aria-current="page">{TOPIC[department]}</strong>
            </>
          ) : null}
        </nav>
        <span className="gh-outline-pill">Public dock</span>
        <div className="gh-counters" aria-hidden="true">
          <span className="gh-counter">
            <span>
              <Starfish size={16} /> Starfish
            </span>
            <span className="gh-code">{products.length}</span>
          </span>
          <span className="gh-counter">
            <span>
              <Fishhook size={16} /> Hooks
            </span>
            <span className="gh-code">{catches.length}</span>
          </span>
        </div>
      </div>

      <nav aria-label="Dock sections" className="gh-tabs">
        <a href={full ? "/?view=list#ships-log" : "#ships-log"}>
          Ship&apos;s Log
        </a>
        <Link href="/#catalog" aria-current="page">
          Catalog <span className="gh-count">{products.length}</span>
        </Link>
        <Link href="/agents">Harbor Master&apos;s Log</Link>
        <Link href="/orders">Cargo Manifest</Link>
      </nav>

      <div className={full ? "gh-home is-full" : "gh-home"}>
        <div className="gh-home-main">
          {full ? null : (
            <section id="ships-log" className="gh-card gh-shipslog">
              <div className="gh-card-title">
                <Logbook size={16} />
                Ship&apos;s Log
                <span className="gh-code gh-muted">SHIPSLOG.md</span>
              </div>
              <div className="gh-shipslog-body">
                <h1>Good things. Great workspace.</h1>
                <p>
                  Hand-picked gear, hauled in fresh daily. Captain Inkwell
                  approved. Agents buy through our ACP checkout; people just
                  browse.
                </p>
              </div>
              <GHFigure pose="lean" className="gh-shipslog-figure" />
            </section>
          )}

          <section
            id="catalog"
            aria-labelledby="catalog-title"
            className={full ? "gh-catalog-full" : "gh-card gh-catalog"}
          >
            <div className="gh-commitbar">
              <span className="gh-avatar" aria-hidden="true" />
              <strong>
                {newest ? catchAuthor(newest) : "captain-inkwell"}
              </strong>
              <span className="gh-code gh-ellipsis">
                {newest
                  ? catchMessage(newest)
                  : `restock: ${units} units docked`}
              </span>
              {newest ? (
                <span className="gh-code gh-muted gh-nowrap">
                  {catchHash(newest.id)} · {ago(newest.created_at)}
                </span>
              ) : null}
              <h2 id="catalog-title" className="gh-commitbar-count">
                {heading} · {shown.length} product
                {shown.length === 1 ? "" : "s"}
              </h2>
              <ViewToggle current={view} hrefFor={hrefFor} />
            </div>
            {full ? (
              <nav aria-label="Topics" className="gh-topics gh-topics-bar">
                <Link href="/" aria-current={department ? undefined : "page"}>
                  all-hands
                </Link>
                {(Object.keys(DEPARTMENTS) as Department[]).map((key) => (
                  <Link
                    key={key}
                    href={`/?d=${key}`}
                    aria-current={department === key ? "page" : undefined}
                  >
                    {TOPIC[key]}
                  </Link>
                ))}
              </nav>
            ) : null}
            {shown.length === 0 ? (
              <p className="gh-empty-row">
                No barnacles, no products. Nothing matches that search.
              </p>
            ) : full ? (
              <ul className="gh-shelf">
                {shown.map((p, i) => (
                  <ProductCard
                    key={p.id}
                    product={p}
                    index={i}
                    lastCatch={p.variants
                      .map((v) => latest.get(v.sku))
                      .find(Boolean)}
                  />
                ))}
              </ul>
            ) : (
              <ul className="gh-rows">
                {shown.map((p) => {
                  const first = p.variants[0];
                  const hit = p.variants
                    .map((v) => latest.get(v.sku))
                    .find(Boolean);
                  const stock = stockOf(p);
                  const held = unitsHeld(p);
                  return (
                    <li key={p.id}>
                      <Link href={`/p/${p.slug}`} className="gh-row">
                        {p.imagePath ? (
                          // biome-ignore lint/performance/noImgElement: fixed-size WebP from public/, no optimizer needed.
                          <img
                            src={p.imagePath}
                            alt=""
                            loading="lazy"
                            decoding="async"
                            className="gh-row-photo"
                          />
                        ) : (
                          <CategoryIcon
                            category={p.category}
                            department={p.department}
                            size={20}
                          />
                        )}
                        <span className="gh-row-name">
                          {p.name}
                          <span className="gh-row-brand">{p.brand}</span>
                        </span>
                        <span className="gh-code gh-muted gh-ellipsis">
                          {hit
                            ? catchMessage(hit)
                            : stock === "out_of_stock"
                              ? "empty hold: out of stock"
                              : `restock: ${held} units docked${
                                  p.variants.length > 1
                                    ? ` · ${p.variants.length} options`
                                    : ""
                                }`}
                        </span>
                        <span className="gh-code gh-row-price">
                          {priceLabel(p)}
                        </span>
                        <span
                          className={`gh-code gh-row-stock stock-${stock}`}
                          title={AVAILABILITY_LABEL[stock]}
                        >
                          <Crate size={14} />
                          <span className="sr-only">
                            {AVAILABILITY_LABEL[stock]},{" "}
                          </span>
                          {first ? held : 0}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        {full ? null : (
          <aside className="gh-home-aside">
            <h2 className="gh-h3">About</h2>
            <p>Everyday things. Thoughtfully netted.</p>
            <nav aria-label="Topics" className="gh-topics">
              {(Object.keys(DEPARTMENTS) as Department[]).map((key) => (
                <Link
                  key={key}
                  href={department === key ? "/" : `/?d=${key}`}
                  aria-current={department === key ? "page" : undefined}
                >
                  {TOPIC[key]}
                </Link>
              ))}
            </nav>
            <ul className="gh-about-list">
              <li>
                <Crate size={16} /> Test merchant for Cartel
              </li>
              <li>
                <Starfish size={16} /> {products.length} products in the hold
              </li>
              <li>
                <Fishhook size={16} /> {catches.length} recent catches
              </li>
            </ul>
            <div className="gh-aside-block">
              <h3 className="gh-h4">Catches this season</h3>
              <TideChart counts={tide} />
            </div>
          </aside>
        )}
      </div>
    </main>
  );
}
