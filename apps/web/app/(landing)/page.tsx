import type { Metadata } from "next";
import Link from "next/link";
import { Figure } from "@/components/doodle/figure";
import { PulledSheet } from "@/components/doodle/pulled-sheet";
import { StatusMark } from "@/components/paper/status-mark";
import { Tape, TornSheet, zigzagPath } from "@/components/paper/torn";

export const metadata: Metadata = {
  title: { absolute: "Cartel · Know exactly what you approved." },
};

const CAST = [
  {
    who: "scout",
    name: "Scout",
    dot: "bg-ink",
    line: "Scout finds. Never holds the wallet.",
  },
  {
    who: "inspector",
    name: "Inspector",
    dot: "bg-green-check",
    line: "Inspector checks every rule against evidence.",
  },
  {
    who: "notary",
    name: "Notary",
    dot: "bg-red-pen",
    line: "Notary stamps only after your Touch ID.",
  },
  {
    who: "guard",
    name: "Guard",
    dot: "bg-highlighter border border-graphite",
    line: "Guard stops the payment if anything changes.",
  },
] as const;

/** A SIGNED stamp with the design's double rule (border + outline). */
function SignedStamp({ className }: { className?: string }) {
  return (
    <span
      className={`inline-block rounded-[3px] border-[3px] border-red-pen px-3.5 py-[5px] font-mono font-semibold text-[22px] text-red-pen tracking-[0.16em] outline outline-[1.5px] outline-red-pen outline-offset-[3px] [filter:url(#stamp)] ${className ?? ""}`}
    >
      SIGNED v7
    </span>
  );
}

const TICKET = zigzagPath(30, 8);

/** The landing page (TASKS T10.6; design Landing v2, kraft desk). */
export default function Home() {
  return (
    <main className="mx-auto max-w-[1440px] text-graphite">
      {/* Hero: a pinned sheet over a kraft sheet, with the contract and the paused checkout. */}
      <section aria-labelledby="hero-title" className="px-3 pt-2 sm:px-10">
        <TornSheet
          seed={11}
          className="grid items-center gap-14 px-6 py-14 sm:px-[72px] sm:pt-[88px] sm:pb-24 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,1fr)]"
          under={
            <>
              <div
                aria-hidden="true"
                className="absolute top-[26px] right-6 -bottom-4 left-[58px] rotate-[.9deg] bg-[#efe4cc] dark:bg-paper-sheet"
              />
              <Tape
                className="-top-1 left-[128px] h-[30px] w-[120px]"
                rotate={-5}
              />
              <Tape className="-top-0.5 right-[150px] w-[104px]" rotate={4} />
            </>
          }
        >
          <div className="flex flex-col gap-7">
            <h1
              id="hero-title"
              className="text-balance font-semibold font-serif text-[48px] leading-none tracking-[-0.035em] sm:text-[64px] xl:text-[84px]"
            >
              Know exactly what you{" "}
              <span className="relative whitespace-nowrap">
                approved.
                <span
                  aria-hidden="true"
                  className="absolute right-3 -bottom-1 left-0 h-[3px] rounded-[2px] bg-ink"
                />
              </span>
            </h1>
            <p className="max-w-[540px] text-pretty text-[19px] text-graphite-2 leading-normal sm:text-[22px]">
              Cartel lets AI shop for you, proves every rule against real
              evidence, and stops the payment if anything changes.
            </p>
            <div className="mt-2 flex flex-wrap gap-3.5">
              <Link
                href="/new"
                className="flex h-14 items-center rounded-card bg-graphite px-7 font-semibold text-[17px] text-paper-raised no-underline shadow-primary hover:opacity-90"
              >
                Start a plan
              </Link>
              <Link
                href="/explore"
                className="flex h-14 items-center rounded-card border border-graphite bg-paper-raised px-[26px] font-medium text-[17px] text-graphite no-underline hover:bg-paper"
              >
                Explore products
              </Link>
            </div>
          </div>

          <figure className="relative mx-auto h-[500px] w-full max-w-[560px]">
            <figcaption className="sr-only">
              Example: contract v7 signed with every hard rule passing, then a
              checkout where the USB-C power fell to 15 W and payment paused.
            </figcaption>
            <div className="absolute top-0 left-0 w-[min(430px,100%)] -rotate-[1.6deg] [filter:drop-shadow(0_1px_1px_rgb(43_42_40/.25))_drop-shadow(0_8px_10px_rgb(43_42_40/.18))]">
              <div
                className="relative bg-paper-sheet px-7 pt-[34px] pb-[84px]"
                style={{ clipPath: "polygon(0 3px,100% 0,100% 100%,0 100%)" }}
              >
                <div className="flex items-center justify-between border-graphite border-b pb-3.5">
                  <span className="font-semibold text-meta uppercase tracking-label">
                    Purchase Contract · v7
                  </span>
                  <span className="font-mono text-meta text-muted">
                    sha256:7c1e…a94f
                  </span>
                </div>
                <p className="mt-4 font-semibold font-serif text-[22px] tracking-[-0.015em]">
                  Home office · Plan A
                </p>
                <dl className="mt-3 grid grid-cols-[30px_1fr] gap-y-2 font-serif text-[15px] leading-[1.55]">
                  <dt className="font-semibold">1.1</dt>
                  <dd>
                    Delivered total not exceeding{" "}
                    <span className="font-mono text-[14px]">$910.00</span>.
                  </dd>
                  <dt className="font-semibold">1.2</dt>
                  <dd>Monitor 27 in, 4K, USB-C power ≥ 65 W.</dd>
                  <dt className="font-semibold">1.3</dt>
                  <dd>Arrives by Mon Sep 28. No substitutions.</dd>
                </dl>
                <div className="mt-[18px] border-rule-soft border-t pt-3.5 text-[14px]">
                  <StatusMark
                    status="pass"
                    label="Pass · 12 of 12 hard rules"
                  />
                </div>
                <SignedStamp className="absolute right-6 bottom-5 -rotate-[7deg]" />
              </div>
            </div>
            <div className="absolute right-0 bottom-0 flex items-end gap-2.5">
              <Figure
                who="guard"
                pose="block"
                h={129}
                className="hidden sm:block"
              />
              <div className="flex w-[300px] rotate-[1.8deg] flex-col gap-3 rounded-sheet border border-graphite bg-paper-sheet px-5 pt-[18px] pb-5 shadow-[0_12px_20px_-14px_rgb(43_42_40/.5)]">
                <div className="flex items-baseline justify-between">
                  <span className="text-[13px] text-muted">
                    Delivered total
                  </span>
                  <span className="num font-medium text-[20px]">$881.07</span>
                </div>
                <StatusMark
                  status="fail"
                  size={15}
                  label="Fail · USB-C power now 15 W"
                  className="text-[13px]"
                />
                <span className="flex h-12 items-center justify-center gap-2 rounded-card border border-rule bg-rule-soft font-semibold text-[16px] text-muted">
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    aria-hidden="true"
                  >
                    <rect x="3" y="7" width="10" height="7" rx="1.5" />
                    <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
                  </svg>
                  Pay paused
                </span>
              </div>
            </div>
          </figure>
        </TornSheet>
      </section>

      {/* Meet the Cartel: a sticky note the Scout pulls down on a rope. */}
      <section aria-labelledby="cast" className="px-3 pt-[150px] sm:px-10">
        <PulledSheet>
          <TornSheet
            seed={23}
            tone="sticky"
            rotate={-0.6}
            className="px-6 py-16 sm:px-[72px] sm:pt-20 sm:pb-[88px]"
            under={
              <>
                <Tape className="top-0 left-[38%]" rotate={-3} />
                <Tape
                  yellow
                  className="right-[180px] -bottom-3.5 w-24"
                  rotate={6}
                />
              </>
            }
          >
            <h2
              id="cast"
              className="scroll-mt-24 font-semibold font-serif text-[40px] leading-[1.05] tracking-[-0.03em] sm:text-[56px]"
            >
              Meet the Cartel
            </h2>
            <ul className="mt-14 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
              {CAST.map((c) => (
                <li key={c.name} className="flex flex-col gap-5">
                  <div className="flex h-[168px] items-end border-rule border-b pb-2.5">
                    <Figure who={c.who} h={144} />
                  </div>
                  <p className="flex items-center gap-2.5 font-semibold font-serif text-[26px] tracking-[-0.02em]">
                    <span
                      aria-hidden="true"
                      className={`size-2.5 rounded-full ${c.dot}`}
                    />
                    {c.name}
                  </p>
                  <p className="text-[17px] text-graphite-2 leading-normal">
                    {c.line}
                  </p>
                </li>
              ))}
            </ul>
          </TornSheet>
        </PulledSheet>
      </section>

      {/* Pencil, ink, stamp: a lined notebook page. */}
      <section aria-labelledby="certainty" className="px-3 pt-10 sm:px-10">
        <TornSheet
          seed={37}
          tone="lined"
          className="px-6 py-16 sm:px-[72px] sm:pt-20 sm:pb-[88px] sm:pl-[88px]"
          under={
            <Tape
              yellow
              className="top-7 left-[44%] h-[30px] w-[120px]"
              rotate={2}
            />
          }
        >
          <h2
            id="certainty"
            className="scroll-mt-24 font-semibold font-serif text-[40px] leading-[1.05] tracking-[-0.03em] sm:text-[56px]"
          >
            Pencil, ink, stamp
          </h2>
          <p className="mt-[18px] max-w-[640px] text-[20px] text-graphite-2 leading-normal">
            How sure Cartel is shows in how each thing is drawn.
          </p>
          <ul className="mt-[52px] grid gap-8 md:grid-cols-3">
            <li className="flex flex-col gap-4 border-graphite border-t pt-5">
              <p className="font-semibold font-serif text-[30px] text-muted tracking-[-0.02em]">
                Pencil
              </p>
              <p className="text-[16px] text-graphite-2 leading-normal">
                Something Cartel assumed or estimated. You confirm it before it
                counts.
              </p>
              <div className="mt-2 flex items-center gap-2.5 rounded-card border border-pencil border-dashed py-3 pr-3 pl-3.5">
                <span className="whitespace-nowrap rounded-[4px] bg-tag px-1.5 py-[3px] font-semibold text-meta text-muted">
                  I assumed
                </span>
                <span className="flex-1 text-[15px] text-graphite-2">
                  USB-C power ≥ 65 W
                </span>
                <Link
                  href="/new"
                  className="flex h-8 items-center rounded-[6px] border border-graphite bg-paper-raised px-3 font-semibold text-[14px] text-graphite no-underline"
                >
                  Confirm?
                </Link>
              </div>
            </li>
            <li className="flex flex-col gap-4 border-graphite border-t pt-5">
              <p className="font-semibold font-serif text-[30px] text-ink tracking-[-0.02em]">
                Ink
              </p>
              <p className="text-[16px] text-graphite-2 leading-normal">
                A source states it. Every spec shows who says so, and when.
              </p>
              <div className="mt-2 flex items-center gap-3.5 rounded-card border border-ink px-3.5 py-3">
                <span className="flex items-center gap-1.5 font-semibold text-[14px] text-ink">
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 20 20"
                    aria-hidden="true"
                  >
                    <rect
                      x="2"
                      y="2"
                      width="16"
                      height="16"
                      rx="3"
                      fill="currentColor"
                    />
                  </svg>
                  Manufacturer says
                </span>
                <span className="mark-highlight rounded-[2px] px-1 font-medium font-mono text-[20px] text-ink">
                  90 W
                </span>
              </div>
            </li>
            <li className="flex flex-col gap-4 border-graphite border-t pt-5">
              <p className="font-semibold font-serif text-[30px] tracking-[-0.02em]">
                Stamp
              </p>
              <p className="text-[16px] text-graphite-2 leading-normal">
                Committed. You signed this exact contract with your passkey.
              </p>
              <div className="mt-2 flex min-h-[60px] items-center pl-2">
                <SignedStamp className="-rotate-[5deg]" />
              </div>
            </li>
          </ul>
        </TornSheet>
      </section>

      {/* The trap: the same SKU, before and after, on two ticket stubs. */}
      <section aria-labelledby="trap" className="px-3 pt-12 sm:px-10">
        <TornSheet
          seed={53}
          tone="kraft"
          rotate={0.35}
          className="px-6 py-16 sm:px-[72px] sm:pt-20 sm:pb-[88px]"
          under={
            <>
              <Tape
                className="top-[34px] right-40 h-[26px] w-[100px]"
                rotate={4}
              />
              <Tape className="top-10 left-[120px] h-6 w-[84px]" rotate={-6} />
            </>
          }
        >
          <h2
            id="trap"
            className="font-semibold font-serif text-[40px] leading-[1.05] tracking-[-0.03em] sm:text-[56px]"
          >
            The trap
          </h2>
          <p className="mt-[18px] max-w-[720px] text-pretty text-[20px] text-graphite-2 leading-normal">
            The merchant cut the price and quietly edited the specs on the same
            SKU. The price drop triggered the purchase. Cartel re-checked first.
          </p>
          <div className="mt-12 grid items-stretch gap-6 md:grid-cols-[minmax(0,1fr)_56px_minmax(0,1fr)] md:gap-0">
            <article
              aria-label="When you signed"
              className="-rotate-[0.6deg] bg-paper-sheet pb-4"
              style={{ clipPath: TICKET }}
            >
              <div className="flex items-center justify-between border-graphite border-b px-5 py-3.5">
                <span className="font-semibold text-meta uppercase tracking-label">
                  When you signed
                </span>
                <span className="font-mono text-[13px]">SKU U2727</span>
              </div>
              <div className="px-5 pt-1.5 pb-2">
                <p className="py-2.5 text-[15px] text-muted">
                  Vireo U2727 27&quot; 4K USB-C
                </p>
                <p className="grid grid-cols-[1fr_auto] items-center border-rule-soft border-t py-3.5">
                  <span className="text-[16px]">Price</span>
                  <span className="font-mono text-[22px] text-ink">
                    $329.00
                  </span>
                </p>
                <p className="grid grid-cols-[1fr_auto] items-center border-rule-soft border-t py-3.5">
                  <span className="text-[16px]">USB-C power</span>
                  <span className="flex items-center gap-3">
                    <StatusMark
                      status="pass"
                      size={14}
                      className="text-[13px]"
                    />
                    <span className="font-mono text-[22px] text-ink">90 W</span>
                  </span>
                </p>
              </div>
            </article>
            <div className="hidden items-center justify-center md:flex">
              <svg
                aria-hidden="true"
                width="28"
                height="16"
                viewBox="0 0 28 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M1 8h25M19 1l7 7-7 7" />
              </svg>
            </div>
            <article
              aria-label="At checkout"
              className="relative rotate-[.7deg] bg-paper-sheet pb-4"
              style={{ clipPath: TICKET }}
            >
              <div className="flex items-center justify-between border-graphite border-b px-5 py-3.5">
                <span className="font-semibold text-meta uppercase tracking-label">
                  At checkout
                </span>
                <span className="font-mono text-[13px]">SKU U2727</span>
              </div>
              <div className="px-5 pt-1.5 pb-2">
                <p className="py-2.5 text-[15px] text-muted">
                  Same SKU, same listing
                </p>
                <p className="grid grid-cols-[1fr_auto] items-center border-rule-soft border-t py-3.5">
                  <span className="text-[16px]">Price</span>
                  <span className="flex items-center gap-3">
                    <span className="font-mono text-[15px] text-muted line-through">
                      <span className="sr-only">was </span>$329.00
                    </span>
                    <span className="font-mono text-[22px] text-ink">
                      $319.00
                    </span>
                  </span>
                </p>
                <p className="grid grid-cols-[1fr_auto] items-center border-rule-soft border-t py-3.5">
                  <span className="text-[16px]">USB-C power</span>
                  <span className="flex items-center gap-[22px]">
                    <StatusMark
                      status="fail"
                      size={14}
                      label="Fail · 15 W < 65 W"
                      className="text-[13px]"
                    />
                    <span className="mark-circle px-1 font-mono text-[22px]">
                      15 W
                    </span>
                  </span>
                </p>
              </div>
            </article>
          </div>
          <div
            className="mt-10 flex flex-wrap items-center gap-x-7 gap-y-3 bg-paper-sheet px-8 py-[22px]"
            style={{ clipPath: "polygon(0 2px,100% 0,100% 100%,0 100%)" }}
          >
            <span className="-rotate-3 whitespace-nowrap rounded-[3px] border-[3px] border-graphite px-3.5 py-[5px] font-mono font-semibold text-[20px] tracking-[0.16em] [filter:url(#stamp)]">
              ✗ BLOCKED
            </span>
            <p className="flex-1 text-[17px] leading-normal">
              Purchase paused. No payment was made.
            </p>
            <p className="text-[14px] text-muted">
              Would have charged{" "}
              <span className="font-mono text-[16px] text-graphite">
                $881.07
              </span>
            </p>
          </div>
          <p className="mt-16 text-center font-semibold font-serif text-[32px] leading-[1.15] tracking-[-0.025em] sm:text-[44px]">
            The payment was valid.{" "}
            <span className="text-red-pen">The purchase wasn&apos;t.</span>
          </p>
        </TornSheet>
      </section>
    </main>
  );
}
