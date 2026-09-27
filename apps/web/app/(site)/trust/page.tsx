import { ArrowRight, Check, X } from "lucide-react";
import type { Metadata } from "next";
import {
  type CheckoutTier,
  TIER,
} from "@/components/cartel/checkout-tier-badge";
import { Figure } from "@/components/doodle/figure";
import { SectionHeading } from "@/components/site/section-heading";

export const metadata: Metadata = {
  title: "How Cartel works",
  description:
    "Four parts, each with its own limits. No single part can both decide and pay.",
};

const DOMAINS = [
  {
    who: "scout",
    name: "Scout",
    tag: "AI · proposes",
    tone: "text-ink",
    can: ["Find products", "Suggest rules", "Draft plans"],
    cant: ["Pay", "Change signed contracts", "Mark a rule as passed"],
  },
  {
    who: "inspector",
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
    who: "notary",
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
    who: "guard",
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
      <div className="mx-auto flex max-w-[1280px] flex-col gap-14 px-5 pt-16 pb-20 sm:px-10">
        <header className="flex max-w-[760px] flex-col gap-3">
          <h1 className="font-semibold font-serif text-[44px] leading-[1.05] tracking-[-0.035em] sm:text-[56px]">
            How Cartel works
          </h1>
          <p className="text-[19px] text-graphite-2 leading-normal">
            Four parts, each with its own limits. No single part can both decide
            and pay.
          </p>
        </header>

        <section aria-labelledby="domains">
          <h2 id="domains" className="sr-only">
            The four parts
          </h2>
          <ol className="grid gap-5 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_32px_minmax(0,1fr)_32px_minmax(0,1fr)_32px_minmax(0,1fr)] xl:gap-0">
            {DOMAINS.map((d, i) => (
              <li key={d.name} className="contents">
                <article
                  aria-labelledby={`d-${d.name}`}
                  className="flex flex-col gap-3.5 rounded-card border border-rule bg-paper-raised px-5 py-[22px] shadow-stack-1 xl:min-h-[520px]"
                >
                  <div className="flex h-[150px] items-end border-rule border-b pb-1.5">
                    <Figure who={d.who} h={136} />
                  </div>
                  <header className="flex flex-col gap-0.5">
                    <h3
                      id={`d-${d.name}`}
                      className="font-semibold font-serif text-[26px] tracking-[-0.02em]"
                    >
                      {d.name}
                    </h3>
                    <p className={`font-semibold text-[14px] ${d.tone}`}>
                      {d.tag}
                    </p>
                  </header>
                  <div className="flex flex-col gap-1.5">
                    <p className="font-bold text-[11.5px] text-green-check tracking-[0.1em]">
                      CAN
                    </p>
                    <ul className="flex flex-col gap-1.5 text-[14.5px] leading-[1.4]">
                      {d.can.map((c) => (
                        <li key={c} className="flex gap-2">
                          <Check
                            size={15}
                            strokeWidth={3}
                            aria-hidden="true"
                            className="mt-0.5 shrink-0 text-green-check"
                          />
                          {c}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <p className="font-bold text-[11.5px] text-red-pen tracking-[0.1em]">
                      CAN&apos;T
                    </p>
                    <ul className="flex flex-col gap-1.5 text-[14.5px] leading-[1.4]">
                      {d.cant.map((c) => (
                        <li key={c} className="flex gap-2">
                          <X
                            size={15}
                            strokeWidth={3}
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
                  <span
                    aria-hidden="true"
                    className="hidden h-[220px] items-center justify-center xl:flex"
                  >
                    <ArrowRight size={22} strokeWidth={2} />
                  </span>
                )}
              </li>
            ))}
          </ol>
        </section>

        <section className="grid gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <div className="flex flex-col gap-4 rounded-card border border-rule bg-paper-raised p-6">
            <h2
              id="certainty"
              className="font-semibold font-serif text-[26px] tracking-[-0.02em]"
            >
              Pencil, ink, stamp
            </h2>
            <ul className="grid gap-4 sm:grid-cols-3">
              <li className="flex flex-col gap-2">
                <span className="self-start rounded-[5px] border border-pencil border-dashed px-2 py-[3px] font-semibold text-[13px] text-muted">
                  I assumed
                </span>
                <span className="text-[14px] text-graphite-2 leading-[1.45]">
                  Pencil: assumed or estimated. Doesn&apos;t count until you
                  confirm.
                </span>
              </li>
              <li className="flex flex-col gap-2">
                <span className="self-start rounded-[5px] border border-ink px-2 py-[3px] font-semibold text-[13px] text-ink">
                  Manufacturer says
                </span>
                <span className="text-[14px] text-graphite-2 leading-[1.45]">
                  Ink: a named source states it, with a time.
                </span>
              </li>
              <li className="flex flex-col gap-2">
                <span className="-rotate-[4deg] self-start rounded-[3px] border-[2.5px] border-red-pen px-[9px] py-0.5 font-mono font-semibold text-[14px] text-red-pen tracking-[0.14em] [filter:url(#stamp)]">
                  SIGNED v7
                </span>
                <span className="text-[14px] text-graphite-2 leading-[1.45]">
                  Stamp: committed with your passkey.
                </span>
              </li>
            </ul>
          </div>
          <div className="flex flex-col gap-3 rounded-card border border-rule bg-paper-raised p-6">
            <h2
              id="tiers"
              className="font-semibold font-serif text-[26px] tracking-[-0.02em]"
            >
              Checkout tiers
            </h2>
            <dl className="grid grid-cols-[auto_1fr] items-center gap-x-3.5 gap-y-2.5 text-[14px] leading-[1.4]">
              {TIERS.map((t) => (
                <div key={t} className="contents">
                  <dt
                    className={`inline-flex h-[26px] items-center justify-self-start whitespace-nowrap rounded-[5px] px-[9px] font-semibold text-[12.5px] ${
                      t === "full"
                        ? "bg-graphite text-paper-raised"
                        : t === "handoff"
                          ? "border border-graphite"
                          : "border border-graphite border-dashed"
                    }`}
                  >
                    {TIER[t].label}
                  </dt>
                  <dd>{TIER[t].blurb}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section
          aria-labelledby="ai"
          className="grid gap-8 lg:grid-cols-[1fr_1.4fr]"
        >
          <SectionHeading id="ai" title="What the AI does, and doesn't">
            The AI helps in five bounded places. It is never on the path from
            facts to verdict to signature to payment. If it&apos;s unavailable,
            Cartel still proves, signs, guards and pays.
          </SectionHeading>
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="rounded-card border border-rule bg-paper-raised p-5">
              <h3 className="pb-2 font-semibold font-serif text-[22px]">
                It does
              </h3>
              <ul className="flex list-disc flex-col gap-2 pl-5 text-[14px]">
                {AI.does.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-card border border-rule bg-paper-raised p-5">
              <h3 className="pb-2 font-semibold font-serif text-[22px]">
                It doesn&apos;t
              </h3>
              <ul className="flex list-disc flex-col gap-2 pl-5 text-[14px]">
                {AI.doesnt.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section aria-labelledby="standards" className="flex flex-col gap-4">
          <h2
            id="standards"
            className="font-semibold font-serif text-[26px] tracking-[-0.02em]"
          >
            Standards used
          </h2>
          <dl className="grid rounded-sheet border border-graphite bg-paper-sheet sm:grid-cols-[180px_1fr]">
            {STANDARDS.map(([name, body], i) => (
              <div key={name} className="contents">
                <dt
                  className={`px-5 pt-3 font-mono font-semibold text-[14px] sm:py-3 ${i > 0 ? "sm:border-rule-soft sm:border-t" : ""}`}
                >
                  {name}
                </dt>
                <dd
                  className={`px-5 pb-3 text-[14px] sm:py-3 ${i > 0 ? "border-rule-soft border-t sm:border-t" : ""}`}
                >
                  {body}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <section
          aria-labelledby="honesty"
          className="flex flex-col gap-2.5 rounded-sheet border border-graphite bg-paper-sheet px-6 py-[22px]"
        >
          <h2 id="honesty" className="font-semibold font-serif text-[22px]">
            Honesty notes
          </h2>
          <p className="text-[15px] leading-normal">
            GreatHub is a test merchant. Nothing ships.
          </p>
          <p className="text-[15px] leading-normal">
            Payments run in the Visa Acceptance sandbox. No real money moves.
          </p>
          <p className="text-[15px] leading-normal">
            Fit, comfort, authenticity and delivery can&apos;t be guaranteed.
            They show as “Can&apos;t check” or “Estimate”, never as a pass.
          </p>
        </section>
      </div>
    </main>
  );
}
