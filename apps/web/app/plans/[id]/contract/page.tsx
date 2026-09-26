import { FLAGSHIP_V8_SIGNATURE } from "@cartel/contracts/fixtures";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ContractDocument,
  type ContractMode,
} from "@/components/contract/contract-document";
import { PlanHeader } from "@/components/plan/plan-header";
import { formatStamp } from "@/lib/contract-view";
import {
  FLAGSHIP,
  FLAGSHIP_ORDER,
  flagshipContract,
  flagshipRevision,
  TRAP_DIFF,
} from "@/lib/flagship";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Contract" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * The contract (TASKS T11.6). The flagship plan has two versions: v7
 * (signed, its mandate fired and was blocked) and v8 (the revision, signed
 * and paid). `?review=1` shows v8 as it was before signing: waivers to
 * tick, autonomy, the mandate builder and Sign with passkey.
 */
export default async function ContractPage({
  params,
  searchParams,
}: PageProps<"/plans/[id]/contract">) {
  const { id } = await params;
  if (id !== FLAGSHIP) notFound();
  const q = await searchParams;
  const version = one(q.v) === "7" ? 7 : 8;
  const review = version === 8 && one(q.review) === "1";
  const view = await flagshipContract(version);
  const revision = version === 8 ? await flagshipRevision() : undefined;
  const signed8 = formatStamp(FLAGSHIP_V8_SIGNATURE.signedAt);
  const shown = review
    ? { ...view, signedAt: null }
    : version === 8
      ? { ...view, signedAt: signed8 }
      : view;
  const mode: ContractMode = review
    ? { kind: "review" }
    : version === 7
      ? {
          kind: "signed",
          status:
            "Superseded by v8. Its mandate fired and the guard blocked payment.",
          statusHref: `/plans/${id}/diff/${TRAP_DIFF}`,
        }
      : {
          kind: "signed",
          status: `Paid ${view.economics.total} within max ${view.economics.max}.`,
          statusHref: `/orders/${FLAGSHIP_ORDER}`,
        };
  const tab = (label: string, href: string, current: boolean) => (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={cn(
        "inline-flex h-8 items-center rounded-pill border px-3 font-semibold text-small",
        current
          ? "border-graphite bg-paper-raised"
          : "border-rule text-muted hover:border-graphite",
      )}
    >
      {label}
    </Link>
  );
  return (
    <div
      data-blueprint
      className="min-h-dvh bg-[#f7f3ea] text-graphite dark:bg-paper"
    >
      <PlanHeader
        back={{ href: `/plans/${id}`, label: "Home office · Plan A" }}
        step={4}
        demo
      />
      <main className="flex flex-col gap-6 px-4 pt-6 sm:px-6">
        <nav
          aria-label="Contract versions"
          className="flex flex-wrap justify-center gap-2"
        >
          {tab("v7 · signed", `/plans/${id}/contract?v=7`, version === 7)}
          {tab("v8 · before signing", `/plans/${id}/contract?review=1`, review)}
          {tab(
            "v8 · signed",
            `/plans/${id}/contract`,
            version === 8 && !review,
          )}
        </nav>
        <ContractDocument
          key={`${version}-${review}`}
          view={shown}
          mode={mode}
          revision={
            revision && {
              lines: revision.lines,
              from: revision.fromHash,
              to: revision.toHash,
              reason: revision.reason,
            }
          }
        />
      </main>
    </div>
  );
}
