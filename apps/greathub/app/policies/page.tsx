import type { Metadata } from "next";

export const metadata: Metadata = { title: "Policies" };

export default function PoliciesPage() {
  return (
    <main className="gh-page gh-prose">
      <p className="gh-code gh-muted">greathub / policies</p>
      <h1 className="gh-title">Policies</h1>
      <p className="gh-lede">
        GreatHub is a test merchant for Cartel. Products, sellers and prices are
        fictional and no goods ship. Payments run against the Visa Acceptance
        sandbox, or a clearly labeled simulator.
      </p>
      <h2 id="returns">Returns</h2>
      <p>
        Each listing states its own return policy: 30-day free returns, 30-day
        returns with a $7.95 fee, 14-day free returns, or final sale. The policy
        shown at checkout is the one that applies.
      </p>
      <h2 id="shipping">Shipping and tax</h2>
      <p>
        Standard shipping is a flat $24.00 per order plus any per-item handling
        surcharge. Estimated sales tax is 7% of merchandise, rounded half-up to
        the cent.
      </p>
      <h2 id="terms">Terms of use</h2>
      <p>
        Agents must sign every request with RFC 9421 HTTP message signatures
        (Ed25519) from a key published in their JWKS. Checkout completion
        requires a scoped payment grant for the exact contract and total. The
        Chaos Deck may change any listing at any time; that is the point.
      </p>
      <h2 id="privacy">Privacy</h2>
      <p>
        Only what checkout needs is stored: the buyer name and email, the
        shipping address, and the verification record. Customers' card numbers
        never reach GreatHub: grants reference tokenized instruments. In the
        sandbox only, a grant may instead name Visa's public test card.
      </p>
    </main>
  );
}
