import type { Metadata } from "next";
import Link from "next/link";
import { StatusMark } from "@/components/paper/status-mark";
import { DemoNote } from "@/components/plan/plan-header";
import { StateCard } from "@/components/states/edge-states";
import { flagshipMandates, type MandateView } from "@/lib/flagship";
import { storedMandates } from "@/lib/orders";

/** Reads the visitor's session and live data on every request. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Mandates" };

const GROUPS: { title: string; statuses: MandateView["status"][] }[] = [
  { title: "Active", statuses: ["armed"] },
  { title: "Fired", statuses: ["fired_executed"] },
  { title: "Blocked", statuses: ["fired_blocked"] },
  { title: "Expired or cancelled", statuses: ["expired", "cancelled"] },
];

const STATUS_MARK = {
  armed: { status: "info", label: "Armed" },
  fired_executed: { status: "pass", label: "Fired · paid" },
  fired_blocked: { status: "fail", label: "Fired · blocked" },
  expired: { status: "unknown", label: "Expired" },
  cancelled: { status: "unknown", label: "Cancelled" },
} as const;

/** Standing mandates (TASKS T11.11): active, fired, blocked and expired. */
export default async function MandatesPage() {
  const [demo, stored] = await Promise.all([
    flagshipMandates(),
    storedMandates(),
  ]);
  const all: (MandateView & { demo: boolean })[] = [
    ...stored.map((m) => ({
      ...m,
      planTitle: "Saved plan",
      detail: "",
      href: `/ledger/${m.planId}`,
      demo: false,
    })),
    ...demo.map((m) => ({ ...m, demo: true })),
  ];
  return (
    <main className="dot-grid min-h-[70vh] text-graphite">
      <div className="mx-auto flex max-w-[960px] flex-col gap-8 px-5 py-12 sm:px-8">
        <div className="flex flex-col gap-2">
          <h1 className="font-semibold font-serif text-h2 tracking-heading">
            Standing mandates
          </h1>
          <p className="max-w-[60ch] text-body text-graphite-2">
            A mandate buys for you when its trigger fires, inside a contract you
            signed. The guard still re-checks every rule before paying.
          </p>
        </div>
        {GROUPS.map((g) => {
          const rows = all.filter((m) => g.statuses.includes(m.status));
          return (
            <section
              key={g.title}
              aria-labelledby={`g-${g.title}`}
              className="flex flex-col gap-3"
            >
              <h2
                id={`g-${g.title}`}
                className="border-graphite border-b pb-2 font-bold text-meta uppercase tracking-label"
              >
                {g.title}{" "}
                <span className="num font-normal text-muted">
                  {rows.length}
                </span>
              </h2>
              {rows.length === 0 ? (
                <p className="text-muted text-small">
                  {g.title === "Active"
                    ? "Nothing armed. Add a mandate in §7 of a contract before you sign it."
                    : "None."}
                </p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {rows.map((m) => {
                    const mark = STATUS_MARK[m.status];
                    return (
                      <li
                        key={m.id}
                        className="sheet flex flex-wrap items-start gap-x-6 gap-y-2 p-4"
                      >
                        <div className="flex min-w-0 flex-1 flex-col gap-1">
                          <p className="flex flex-wrap items-center gap-2 font-semibold text-ui">
                            {m.trigger}
                            {m.demo && <DemoNote />}
                          </p>
                          <p className="text-muted text-small">
                            {m.planTitle} · contract v{m.version} · not after{" "}
                            {m.notAfter}
                            {m.nextCheck ? ` · next check ${m.nextCheck}` : ""}
                          </p>
                          {m.detail && <p className="text-small">{m.detail}</p>}
                        </div>
                        <StatusMark status={mark.status} label={mark.label} />
                        <div className="flex w-full flex-wrap gap-4 text-small sm:w-auto">
                          <Link
                            href={m.href}
                            className="text-ink underline underline-offset-4"
                          >
                            Details
                          </Link>
                          {m.status === "armed" && (
                            <button
                              type="button"
                              disabled
                              title="Cancelling a mandate arrives with standing mandates (TASKS T14)."
                              className="text-muted underline underline-offset-4 disabled:cursor-not-allowed"
                            >
                              Cancel mandate (not yet available)
                            </button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
        {all.length === 0 && (
          <StateCard title="No mandates yet." eyebrow="Mandates">
            Sign a contract with a standing mandate and it shows here.
          </StateCard>
        )}
      </div>
    </main>
  );
}
