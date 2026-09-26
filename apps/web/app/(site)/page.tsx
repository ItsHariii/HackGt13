import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ContractDiff, type DiffLine } from "@/components/cartel/contract-diff";
import { Figure } from "@/components/doodle/figure";
import { Mark } from "@/components/paper/mark";
import { Stamp } from "@/components/paper/stamp";
import { StatusMark } from "@/components/paper/status-mark";
import { Certainty } from "@/components/site/certainty";
import { SectionHeading } from "@/components/site/section-heading";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: { absolute: "Cartel · Know exactly what you approved." },
};

const CLAUSES = [
  ["1.1", "Delivered total not exceeding $910.00"],
  ["1.2", "Monitor 27 in, 4K, USB-C power ≥ 65 W"],
  ["1.3", "Arrives by Mon Sep 28. No substitutions."],
] as const;

/** One line each; the figures themselves arrive with the cast (T10B). */
const CAST = [
  {
    who: "scout",
    name: "Scout",
    role: "AI shopper",
    tone: "text-ink",
    line: "finds. Never holds the wallet.",
  },
  {
    who: "inspector",
    name: "Inspector",
    role: "Proof engine",
    tone: "text-green-check",
    line: "checks every rule against evidence.",
  },
  {
    who: "notary",
    name: "Notary",
    role: "Your signature",
    tone: "text-red-pen",
    line: "stamps only after your Touch ID.",
  },
  {
    who: "guard",
    name: "Guard",
    role: "Payment guard",
    tone: "text-graphite",
    line: "stops the payment if anything changes.",
  },
] as const;

const STEPS = [
  [
    "Say what you need",
    "Budget, sizes, deadlines, deal-breakers. Cartel turns them into rules you can read and edit.",
  ],
  [
    "Check every rule",
    "Each hard rule passes, fails or says it can't check, with the evidence and its source.",
  ],
  [
    "Sign one exact version",
    "Your passkey signs this contract's hash. Any change makes a new version.",
  ],
  [
    "Pay, or pause",
    "Right before paying, Cartel re-checks the live checkout. If a rule fails, nothing is charged.",
  ],
] as const;

const MINI_DIFF: DiffLine[] = [
  { kind: "ctx", label: "Desk", text: 'Birchline 46.5"', amount: "$229.00" },
  {
    kind: "del",
    label: "Monitor",
    text: "Vireo U2727 · USB-C now 15 W",
    amount: "$329.00",
  },
  {
    kind: "add",
    label: "Monitor",
    text: "Halden M27Q-USBC · USB-C 65 W",
    amount: "$309.00",
  },
  { kind: "del", label: "Maximum", text: "", amount: "$910.00" },
  { kind: "add", label: "Maximum", text: "", amount: "$885.00" },
];

/** The landing page (TASKS T10.6; design Landing v2, kraft desk). */
export default function Home() {
  return (
    <main className="bg-kraft text-graphite">
      <section
        aria-labelledby="hero-title"
        className="mx-auto grid max-w-[1320px] items-center gap-12 px-5 pt-14 pb-20 sm:px-10 lg:grid-cols-[1.05fr_1fr] lg:gap-16 lg:pt-24"
      >
        <div className="flex flex-col gap-6">
          <p className="font-semibold text-graphite-2 text-meta uppercase tracking-label">
            Shopping syndicate · Est. 2026
          </p>
          <h1
            id="hero-title"
            className="font-semibold font-serif text-[44px] leading-[1.05] tracking-heading sm:text-h1 xl:text-display"
          >
            Know exactly what you approved.
          </h1>
          <p className="max-w-[520px] text-body text-graphite-2">
            Cartel lets AI shop for you, proves every rule against real
            evidence, and stops the payment if anything changes.
          </p>
          <div className="flex flex-wrap items-center gap-4 pt-2">
            <Button asChild>
              <Link href="/new">
                Start a plan <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/explore">Explore products</Link>
            </Button>
          </div>
          <p className="text-graphite-2 text-small">
            Nothing is bought until you sign a contract.{" "}
            <Link href="/trust" className="underline underline-offset-4">
              How Cartel works
            </Link>
          </p>
        </div>

        <figure className="relative mx-auto w-full max-w-[480px]">
          <figcaption className="sr-only">
            Example: a signed purchase contract, then the checkout that paused
            payment
          </figcaption>
          <article className="relative rotate-[0.4deg] rounded-sheet border border-rule bg-paper-sheet p-7 shadow-page">
            <span
              aria-hidden="true"
              className="absolute -top-3 left-1/2 h-6 w-24 -translate-x-1/2 -rotate-2 bg-tape/90"
            />
            <div className="flex items-center justify-between border-rule border-b pb-3 font-mono text-meta text-muted">
              <span>Purchase Contract · v7</span>
              <span>sha256:7c1e…a94f</span>
            </div>
            <h2 className="pt-5 font-semibold font-serif text-h3">
              Home office · Plan A
            </h2>
            <ol className="flex flex-col py-4 font-serif text-[16px]">
              {CLAUSES.map(([n, text]) => (
                <li
                  key={n}
                  className="flex gap-3 border-rule-soft border-b py-2.5"
                >
                  <span className="num text-muted text-small">{n}</span>
                  {text}
                </li>
              ))}
            </ol>
            <div className="flex items-center justify-between gap-4">
              <div className="flex flex-col gap-1">
                <StatusMark status="pass" label="Pass · 12 of 12 hard rules" />
                <p className="text-small">
                  Delivered total{" "}
                  <span className="num font-semibold">$881.07</span>
                </p>
              </div>
              <Stamp tone="signed" detail="Sep 26, 10:42">
                SIGNED v7
              </Stamp>
            </div>
          </article>
          <aside
            aria-label="At checkout"
            className="relative -mt-4 ml-8 -rotate-[0.6deg] rounded-sheet border border-red-pen bg-paper-sheet p-5 shadow-page sm:ml-16"
          >
            <p className="flex flex-wrap items-center gap-x-2 text-small">
              <StatusMark status="fail" label="Fail" />
              USB-C power now <Mark type="circle">15 W</Mark>
            </p>
            <p className="pt-2 font-semibold text-red-pen text-small">
              Pay paused. No payment was made.
            </p>
          </aside>
        </figure>
      </section>

      <section
        aria-labelledby="cast"
        className="border-graphite/20 border-t bg-paper"
      >
        <div className="mx-auto flex max-w-[1320px] flex-col gap-10 px-5 py-20 sm:px-10">
          <SectionHeading id="cast" eyebrow="The cast" title="Meet the Cartel">
            Four parts, each with its own limits. No single part can both decide
            and pay.
          </SectionHeading>
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {CAST.map((c) => (
              <li key={c.name} className="sheet flex flex-col gap-2 p-5">
                <Figure who={c.who} h={88} className="mb-1" />
                <p className="font-semibold text-graphite-2 text-meta uppercase tracking-label">
                  {c.role}
                </p>
                <p className="font-serif text-h4 leading-snug">
                  <span className={`font-semibold ${c.tone}`}>{c.name}</span>{" "}
                  {c.line}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section aria-labelledby="how-it-works" className="bg-paper">
        <div className="mx-auto flex max-w-[1320px] flex-col gap-10 px-5 pb-20 sm:px-10">
          <SectionHeading
            id="how-it-works"
            eyebrow="How it works"
            title="From a sentence to a signed purchase"
          />
          <ol className="grid gap-8 md:grid-cols-4">
            {STEPS.map(([title, body], i) => (
              <li
                key={title}
                className="flex flex-col gap-2 border-graphite border-t pt-4"
              >
                <span className="num text-ink text-small">0{i + 1}</span>
                <h3 className="font-semibold font-serif text-h4">{title}</h3>
                <p className="text-graphite-2 text-small">{body}</p>
              </li>
            ))}
          </ol>
          <div className="grid items-start gap-8 lg:grid-cols-[1fr_1.2fr]">
            <div className="flex flex-col gap-2">
              <h3 className="font-semibold font-serif text-h4">
                Consent is a diff, not a vibe
              </h3>
              <p className="text-graphite-2 text-small">
                When something changes, Cartel shows exactly what, line by line,
                and asks you to sign the new version. Nothing changes until you
                do.
              </p>
            </div>
            <ContractDiff
              from="v7"
              to="v8"
              lines={MINI_DIFF}
              caption="Contract v7 → v8"
            />
          </div>
        </div>
      </section>

      <section
        aria-labelledby="certainty"
        className="border-graphite/20 border-t"
      >
        <div className="mx-auto flex max-w-[1320px] flex-col gap-10 px-5 py-20 sm:px-10">
          <SectionHeading id="certainty" title="Pencil, ink, stamp">
            How sure Cartel is shows in how each thing is drawn.
          </SectionHeading>
          <Certainty />
        </div>
      </section>

      <section aria-labelledby="trap" className="bg-paper">
        <div className="mx-auto flex max-w-[1320px] flex-col gap-10 px-5 py-20 sm:px-10">
          <SectionHeading
            id="trap"
            eyebrow="The trap"
            title="The payment was valid. The purchase wasn't."
          >
            The monitor got $10 cheaper on the same listing, and its USB-C power
            quietly dropped from 90 W to 15 W.
          </SectionHeading>
          <div className="grid gap-6 md:grid-cols-2">
            <div className="sheet-formal flex flex-col gap-3 p-6">
              <p className="font-semibold text-muted text-meta uppercase tracking-label">
                Approved · v7
              </p>
              <p className="font-mono text-small">SKU U2727</p>
              <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-ui">
                <dt>Price</dt>
                <dd className="num">$329.00</dd>
                <dt>USB-C power</dt>
                <dd className="num">90 W</dd>
                <dt>Your rule</dt>
                <dd className="num">≥ 65 W</dd>
              </dl>
              <StatusMark status="pass" />
            </div>
            <div className="sheet-formal flex flex-col gap-3 border-red-pen p-6">
              <p className="font-semibold text-muted text-meta uppercase tracking-label">
                At checkout
              </p>
              <p className="font-mono text-small">SKU U2727 (same listing)</p>
              <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-ui">
                <dt>Price</dt>
                <dd className="num">$319.00</dd>
                <dt>USB-C power</dt>
                <dd>
                  <Mark type="circle">15 W</Mark>
                </dd>
                <dt>Your rule</dt>
                <dd className="num">≥ 65 W</dd>
              </dl>
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <StatusMark status="fail" />
                  <p className="pt-1 font-semibold text-small">
                    Purchase paused. No payment was made.
                  </p>
                  <p className="text-muted text-small">
                    Would have charged $881.07
                  </p>
                </div>
                <Stamp tone="blocked">BLOCKED</Stamp>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <Button asChild>
              <Link href="/new">Start a plan</Link>
            </Button>
            <Link
              href="/trust"
              className="text-graphite underline underline-offset-4"
            >
              What each part can and can't do
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
