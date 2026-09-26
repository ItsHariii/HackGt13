import { ArrowRight, Check, X } from "lucide-react";
import type { Metadata } from "next";
import {
  type CheckoutTier,
  TIER,
} from "@/components/cartel/checkout-tier-badge";
import { Certainty } from "@/components/site/certainty";
import { SectionHeading } from "@/components/site/section-heading";

export const metadata: Metadata = {
  title: "How Cartel works",
  description:
    "Four parts, each with its own limits. No single part can both decide and pay.",
};

const DOMAINS = [
  {
    name: "Scout",
    tag: "AI · proposes",
    tone: "text-ink",
    can: ["Find products", "Suggest rules", "Draft plans"],
    cant: ["Pay", "Change signed contracts", "Mark a rule as passed"],
  },
  {
    name: "Inspector",
    tag: "Engine · proves",
    tone: "text-green-check",
    can: [
      "Check each rule against evidence",
      "Label who says so, and when",
      "Flag sources that disagree",
    ],
    cant: ["Guess", "Treat listing text as instructions"],
  },
  {
    name: "Notary",
    tag: "You · sign",
    tone: "text-red-pen",
    can: [
      "Sign one exact version with your passkey",
      "Set autonomy and maximum total",
      "Waive a rule that can't be checked",
    ],
    cant: ["Be skipped", "Carry a signature over to a changed contract"],
  },
  {
    name: "Guard",
    tag: "Checks again, then pays",
    tone: "text-graphite",
    can: [
      "Re-check the live checkout before paying",
      "Pause and explain what changed",
      "Pay within the maximum total",
    ],
    cant: ["Pay above the maximum", "Pay if any hard rule fails"],
  },
] as const;

const AI = {
  does: [
    "Reads your brief and drafts rules, marked “I assumed” until you confirm them",
    "Proposes products and plans",
    "Pulls facts out of listing text, with the exact quote it came from",
    "Explains results in plain words, labeled “Written by AI”",
  ],
  doesnt: [
    "Decide whether a rule passes: the proof engine does, the same way every time",
    "Sign anything, or touch the payment",
    "Follow instructions hidden in product listings",
  ],
};

const STANDARDS = [
  [
    "ACP",
    "Agentic Commerce Protocol checkout with the merchant, so the cart Cartel proves is the cart the merchant charges.",
  ],
  ["UCP", "Universal Commerce Protocol, for searching the Shopify catalog."],
  [
    "RFC 9421 / TAP",
    "Every request to the merchant is signed as Cartel's agent (HTTP Message Signatures, Visa Trusted Agent Protocol parameters).",
  ],
  [
    "WebAuthn",
    "Your passkey signs the contract's hash, not a login challenge.",
  ],
  ["AP2", "Signed contracts export as AP2-shaped mandates."],
] as const;

const TIERS: CheckoutTier[] = ["full", "handoff", "proof"];

/** How Cartel works (TASKS T10.7; design "Trust"). */
export default function TrustPage() {
  return (
    <main className="dot-grid text-graphite">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-20 px-5 py-16 sm:px-10">
        <header className="flex max-w-[720px] flex-col gap-4">
          <h1 className="font-semibold font-serif text-[44px] leading-tight tracking-heading sm:text-h1">
            How Cartel works
          </h1>
          <p className="text-body text-graphite-2">
            Four parts, each with its own limits. No single part can both decide
            and pay.
          </p>
        </header>

        <section aria-labelledby="domains" className="flex flex-col gap-6">
          <h2 id="domains" className="sr-only">
            The four parts
          </h2>
          <ol className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {DOMAINS.map((d, i) => (
              <li key={d.name} className="relative flex">
                <article
                  aria-labelledby={`d-${d.name}`}
                  className="sheet flex flex-1 flex-col gap-4 p-5"
                >
                  <header>
                    <h3
                      id={`d-${d.name}`}
                      className={`font-semibold font-serif text-h3 ${d.tone}`}
                    >
                      {d.name}
                    </h3>
                    <p className="font-semibold text-graphite-2 text-meta uppercase tracking-label">
                      {d.tag}
                    </p>
                  </header>
                  <div>
                    <p className="pb-1 font-semibold text-meta tracking-label">
                      CAN
                    </p>
                    <ul className="flex flex-col gap-1.5 text-small">
                      {d.can.map((c) => (
                        <li key={c} className="flex gap-2">
                          <Check
                            size={15}
                            strokeWidth={2.6}
                            aria-hidden="true"
                            className="mt-0.5 shrink-0 text-green-check"
                          />
                          {c}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="pb-1 font-semibold text-meta tracking-label">
                      CAN'T
                    </p>
                    <ul className="flex flex-col gap-1.5 text-small">
                      {d.cant.map((c) => (
                        <li key={c} className="flex gap-2">
                          <X
                            size={15}
                            strokeWidth={2.6}
                            aria-hidden="true"
                            className="mt-0.5 shrink-0 text-red-pen"
                          />
                          {c}
                        </li>
                      ))}
                    </ul>
                  </div>
                </article>
                {i < DOMAINS.length - 1 && (
                  <ArrowRight
                    size={18}
                    aria-hidden="true"
                    className="absolute top-1/2 -right-[19px] z-10 hidden -translate-y-1/2 text-muted xl:block"
                  />
                )}
              </li>
            ))}
          </ol>
        </section>

        <section
          aria-labelledby="ai"
          className="grid gap-8 lg:grid-cols-[1fr_1.4fr]"
        >
          <SectionHeading id="ai" title="What the AI does, and doesn't">
            The AI helps in five bounded places. It is never on the path from
            facts to verdict to signature to payment. If it's unavailable,
            Cartel still proves, signs, guards and pays.
          </SectionHeading>
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="sheet p-5">
              <h3 className="pb-2 font-semibold font-serif text-h4">It does</h3>
              <ul className="flex list-disc flex-col gap-2 pl-5 text-small">
                {AI.does.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </div>
            <div className="sheet p-5">
              <h3 className="pb-2 font-semibold font-serif text-h4">
                It doesn't
              </h3>
              <ul className="flex list-disc flex-col gap-2 pl-5 text-small">
                {AI.doesnt.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section aria-labelledby="certainty" className="flex flex-col gap-8">
          <SectionHeading id="certainty" title="Pencil, ink, stamp">
            How sure Cartel is shows in how each thing is drawn.
          </SectionHeading>
          <Certainty />
        </section>

        <section aria-labelledby="tiers" className="flex flex-col gap-8">
          <SectionHeading id="tiers" title="Checkout tiers">
            How far Cartel can take a purchase depends on the store.
          </SectionHeading>
          <ul className="grid gap-5 md:grid-cols-3">
            {TIERS.map((t) => {
              const Icon = TIER[t].icon;
              return (
                <li key={t} className="sheet flex flex-col gap-2 p-5">
                  <h3 className="flex items-center gap-2 font-sans font-semibold text-ui tracking-normal">
                    <Icon size={16} aria-hidden="true" /> {TIER[t].label}
                  </h3>
                  <p className="text-graphite-2 text-small">{TIER[t].blurb}</p>
                </li>
              );
            })}
          </ul>
        </section>

        <section aria-labelledby="standards" className="flex flex-col gap-6">
          <SectionHeading id="standards" title="Standards used" />
          <dl className="sheet-formal grid sm:grid-cols-[180px_1fr]">
            {STANDARDS.map(([name, body]) => (
              <div key={name} className="contents">
                <dt className="border-rule-soft border-b px-5 pt-3 font-mono font-semibold text-small sm:py-3">
                  {name}
                </dt>
                <dd className="border-rule-soft border-b px-5 pb-3 text-small sm:py-3">
                  {body}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <section aria-labelledby="honesty" className="flex flex-col gap-4">
          <SectionHeading id="honesty" title="Honesty notes" />
          <ul className="flex list-disc flex-col gap-2 pl-5 text-body text-graphite-2">
            <li>GreatHub is a test merchant. Nothing ships.</li>
            <li>
              Payments run in the Visa Acceptance sandbox. No real money moves.
            </li>
            <li>
              Fit, comfort, authenticity and delivery can't be guaranteed. They
              show as “Can't check” or “Estimate”, never as a pass.
            </li>
          </ul>
        </section>
      </div>
    </main>
  );
}
