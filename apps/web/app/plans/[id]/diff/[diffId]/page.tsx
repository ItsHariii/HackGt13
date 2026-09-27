import { Lock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EvidenceBadge } from "@/components/cartel/evidence-badge";
import { HashPill } from "@/components/cartel/hash-pill";
import { GuardStepIn } from "@/components/doodle/moments";
import { Mark } from "@/components/paper/mark";
import { StatusMark } from "@/components/paper/status-mark";
import { Announce } from "@/components/paused/announce";
import { PlanHeader } from "@/components/plan/plan-header";
import { FLAGSHIP, flagshipPaused, TRAP_DIFF } from "@/lib/flagship";

export const metadata: Metadata = { title: "Purchase paused" };

/** Purchase Paused (TASKS T11.8; designs "Purchase Paused" + Blueprint + mobile). */
export default async function PausedPage({
  params,
}: PageProps<"/plans/[id]/diff/[diffId]">) {
  const { id, diffId } = await params;
  if (id !== FLAGSHIP || diffId !== TRAP_DIFF) notFound();
  const p = await flagshipPaused();
  return (
    <div data-blueprint className="dot-grid min-h-dvh pb-24 text-graphite">
      <PlanHeader
        back={{ href: `/plans/${id}`, label: "Home office · Plan A" }}
        demo
        right={
          <span className="hidden items-center gap-2 text-[13px] text-muted sm:flex">
            Contract v{p.version} ·
            <HashPill hash={p.contractHash} />
          </span>
        }
      />
      <Announce text={p.announcement} />
      <main className="mx-auto flex max-w-[1200px] flex-col gap-14 px-5 sm:px-10">
        <section
          aria-labelledby="paused-title"
          className="grid gap-12 pt-16 lg:grid-cols-[minmax(0,1fr)_460px] lg:items-center"
        >
          <div className="flex flex-col items-start gap-[22px]">
            <h1
              id="paused-title"
              className="my-2.5 ml-2 -rotate-3 rounded-[4px] border-[5px] border-red-pen px-[26px] pt-2.5 pb-2 font-bold font-mono text-[38px] text-red-pen leading-none tracking-[0.1em] outline outline-2 outline-red-pen outline-offset-[5px] [filter:url(#stamp)] sm:text-[60px]"
            >
              PURCHASE PAUSED
            </h1>
            <p className="mt-2 font-bold text-[28px] tracking-[-0.015em] sm:text-[32px]">
              No payment was made.
            </p>
            <p className="max-w-[600px] text-pretty text-[18px] text-graphite-2 leading-[1.55]">
              {p.lead}
            </p>
            <p className="flex flex-wrap gap-[18px] font-mono text-[14px] text-muted">
              <span>{p.when}</span>
              {p.trigger && <span>{p.trigger}</span>}
            </p>
          </div>

          <section aria-label="Payment blocked" className="relative h-[300px]">
            <div className="absolute top-10 right-0 flex w-[330px] max-w-full flex-col gap-3 rounded-sheet border border-graphite bg-paper-sheet px-5 pt-[18px] pb-5">
              <div className="flex items-baseline justify-between">
                <span className="text-[13px] text-muted">
                  GreatHub checkout
                </span>
                <span className="num text-[18px] text-muted">
                  {p.checkoutTotal}
                </span>
              </div>
              <button
                type="button"
                disabled
                aria-disabled="true"
                className="flex h-[52px] items-center justify-center gap-2 rounded-card border border-rule bg-rule-soft font-semibold text-[16px] text-muted"
              >
                <Lock size={14} aria-hidden="true" /> Pay {p.checkoutTotal}
              </button>
              <p className="sr-only">Payment blocked by the guard.</p>
            </div>
            <svg
              width="360"
              height="110"
              viewBox="0 0 360 110"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              aria-hidden="true"
              className="absolute top-[150px] -right-2.5 hidden sm:block"
            >
              <path d="M40 30V104M30 104H50M320 30V104M310 104H330" />
              <circle cx="40" cy="27" r="4" fill="currentColor" />
              <circle cx="320" cy="27" r="4" fill="currentColor" />
              <path
                d="M40 36Q180 86 320 36"
                strokeWidth="4"
                className="stroke-red-pen"
              />
            </svg>
            <div className="absolute top-[74px] left-0 hidden sm:block">
              <GuardStepIn h={192} />
            </div>
          </section>
        </section>

        <section className="grid items-start gap-8 lg:grid-cols-2">
          <div className="flex flex-col gap-3.5">
            <div className="flex items-baseline gap-3">
              <h2
                id="checked-title"
                className="font-semibold font-serif text-[28px] tracking-[-0.02em]"
              >
                What was checked
              </h2>
              <span className="text-[14px] text-muted">
                {p.layers.length} layers, in order
              </span>
            </div>
            <table
              aria-labelledby="checked-title"
              className="w-full rounded-sheet border border-graphite bg-paper-sheet text-left"
            >
              <thead>
                <tr className="border-graphite border-b font-semibold text-[11.5px] text-muted tracking-[0.08em] [&>th]:px-[18px] [&>th]:py-2.5">
                  <th scope="col" className="font-semibold">
                    #
                  </th>
                  <th scope="col" className="font-semibold">
                    LAYER
                  </th>
                  <th scope="col" className="font-semibold">
                    RESULT
                  </th>
                </tr>
              </thead>
              <tbody>
                {p.layers.map((l, i) => (
                  <tr
                    key={l.name}
                    className={`[&>*]:px-[18px] [&>*]:py-[15px] ${
                      l.status === "fail"
                        ? "bg-red-pen-wash shadow-[inset_3px_0_0_var(--color-red-pen)]"
                        : "border-rule-soft border-b"
                    }`}
                  >
                    <td className="font-mono text-[13px] text-muted">
                      {i + 1}
                    </td>
                    <th scope="row" className="font-semibold text-[15px]">
                      {l.name}
                    </th>
                    <td className="text-[14.5px]">
                      <span className="flex flex-wrap items-center gap-2">
                        <StatusMark status={l.status} size={18} />
                        <span>{l.detail}</span>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-1 text-pretty font-serif text-[19px] leading-[1.45]">
              Every payment check passed. The purchase still didn&apos;t match
              what you approved.
            </p>
          </div>

          {p.changed && (
            <div className="flex flex-col gap-3.5">
              <div className="flex items-baseline gap-3">
                <h2
                  id="changed-title"
                  className="font-semibold font-serif text-[28px] tracking-[-0.02em]"
                >
                  What changed
                </h2>
                <span className="text-[14px] text-muted">
                  {p.changed.heading}
                </span>
              </div>
              <table
                aria-labelledby="changed-title"
                className="w-full rounded-sheet border border-graphite bg-paper-sheet text-left"
              >
                <thead>
                  <tr className="border-graphite border-b font-semibold text-[11.5px] text-muted tracking-[0.08em] [&>th]:px-[18px] [&>th]:py-2.5">
                    <th scope="col" className="w-[130px]">
                      <span className="sr-only">Field</span>
                    </th>
                    <th scope="col" className="font-semibold">
                      APPROVED · v{p.version}
                    </th>
                    <th scope="col" className="font-semibold">
                      CURRENT · CHECKOUT
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {p.changed.rows.map((r) => (
                    <tr
                      key={r.label}
                      className="border-rule-soft border-b last:border-b-0 [&>*]:px-[18px] [&>*]:py-3.5"
                    >
                      <th
                        scope="row"
                        className="font-normal text-[14px] text-muted"
                      >
                        {r.label}
                      </th>
                      <td className="num text-[16px] text-ink">
                        {r.label === "Result" ? (
                          <StatusMark status="pass" size={18} />
                        ) : (
                          r.approved
                        )}
                      </td>
                      <td className="num text-[16px] text-ink">
                        {r.label === "Result" ? (
                          <StatusMark status="fail" size={18} />
                        ) : r.failing ? (
                          <Mark type="circle">{r.current}</Mark>
                        ) : (
                          r.current
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <aside className="flex flex-col gap-2 rounded-card border border-pencil border-dashed bg-paper-raised/70 px-[18px] py-4">
                <span className="self-start rounded-[4px] bg-tag px-[7px] py-[3px] font-semibold text-[12px] text-muted">
                  Summary
                </span>
                <p className="text-[16px] text-graphite-2 leading-[1.55]">
                  {p.summary}
                </p>
                <span className="text-[12.5px] text-muted">
                  Written from a template. The tables are the record.
                </span>
              </aside>
            </div>
          )}
        </section>

        <section aria-labelledby="alt-title" className="flex flex-col gap-3.5">
          <div className="flex flex-wrap items-baseline gap-3">
            <h2
              id="alt-title"
              className="font-semibold font-serif text-[28px] tracking-[-0.02em]"
            >
              Compliant alternative
            </h2>
            <span className="text-[14px] text-muted">
              Nothing changes until you sign a new version
            </span>
          </div>
          <div className="grid items-center gap-7 rounded-card border border-rule bg-paper-raised px-6 py-[22px] shadow-stack md:grid-cols-[120px_minmax(0,1fr)_auto]">
            <div
              aria-hidden="true"
              className="flex h-24 w-[120px] items-center justify-center rounded-sheet border border-rule bg-[repeating-linear-gradient(135deg,#f3eee2_0_7px,#ece5d6_7px_14px)] dark:bg-[repeating-linear-gradient(135deg,#1f3352_0_7px,#223556_7px_14px)]"
            >
              <span className="rounded-[3px] bg-paper px-[5px] py-px font-mono text-[11px] text-muted">
                photo
              </span>
            </div>
            <div className="flex flex-col gap-2.5">
              <p className="flex flex-wrap items-baseline gap-4">
                <span className="font-semibold font-serif text-[24px] tracking-[-0.02em]">
                  {p.alternative.title}
                </span>
                <span className="text-[15px] text-muted">
                  {p.alternative.spec} · GreatHub
                </span>
              </p>
              <p className="flex flex-wrap items-center gap-[18px]">
                <EvidenceBadge level={p.alternative.evidence} />
                <span className="num font-medium text-[18px] text-ink">
                  {p.alternative.price}
                </span>
                <StatusMark
                  status="pass"
                  size={17}
                  className="text-[14.5px]"
                  label={`All ${p.alternative.hardPass} checkable hard rules pass${
                    p.alternative.waived
                      ? ` · ${p.alternative.waived} waived by you`
                      : ""
                  }`}
                />
              </p>
            </div>
            <div className="flex flex-col items-start gap-2.5 md:items-end">
              <Link
                href={`/plans/${id}/contract?review=1`}
                className="inline-flex h-[52px] items-center rounded-card bg-graphite px-6 font-semibold text-[16px] text-paper-raised no-underline shadow-primary hover:opacity-90"
              >
                Review revised contract
              </Link>
              <Link
                href={`/plans/${id}`}
                className="text-[14px] text-ink underline-offset-[3px] hover:underline"
              >
                Not now, keep it paused
              </Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
