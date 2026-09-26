import { Armchair, Cable, Monitor, Table2 } from "lucide-react";

const products = [
  {
    icon: Table2,
    category: "MAKE ROOM",
    title: "Birchline Compact Desk 46.5″",
    price: "$229.00",
    detail: "Small footprint. Room to think.",
  },
  {
    icon: Armchair,
    category: "SETTLE IN",
    title: "Kestrel Mesh Task Chair",
    price: "$189.00",
    detail: "A little support for your big ideas.",
  },
  {
    icon: Monitor,
    category: "SEE CLEARLY",
    title: "Vireo U2727 27″ 4K USB-C",
    price: "$329.00",
    detail: "Your day, in sharper focus.",
  },
  {
    icon: Cable,
    category: "CONNECT THE DOTS",
    title: "Loop USB-C Cable 100 W, 2 m",
    price: "$19.00",
    detail: "One less thing to untangle.",
  },
];
export default function Home() {
  return (
    <main>
      <section className="merchant-hero">
        <div>
          <p className="eyebrow">EVERYDAY THINGS. THOUGHTFULLY PICKED.</p>
          <h1>
            Good things.
            <br />
            <span>Great workspace.</span>
          </h1>
          <p>Make a little room for your next big idea.</p>
          <a className="primary-link" href="#collection">
            Meet the collection ↓
          </a>
        </div>
        <div className="merchant-illustration" aria-hidden="true">
          <Monitor size={160} strokeWidth={1} />
          <div className="desk-line" />
          <span>THE WORKDAY EDIT / 001</span>
        </div>
      </section>
      <section id="collection" className="collection">
        <div className="collection-heading">
          <div>
            <p className="eyebrow">THE WORKDAY EDIT</p>
            <h2>A place to do your thing.</h2>
          </div>
          <span>Preview collection · 4 items</span>
        </div>
        <div className="product-grid">
          {products.map(({ icon: Icon, category, title, price, detail }) => (
            <article className="product-card" key={title}>
              <div className="product-art">
                <span>{category}</span>
                <Icon size={95} strokeWidth={1} aria-hidden="true" />
              </div>
              <div className="product-info">
                <h3>{title}</h3>
                <p>{detail}</p>
                <div>
                  <strong>{price}</strong>
                  <span>Demo item</span>
                </div>
              </div>
            </article>
          ))}
        </div>
        <p className="collection-note">
          A preview of our fictional catalog. Checkout and live inventory are
          coming in later phases.
        </p>
      </section>
    </main>
  );
}
