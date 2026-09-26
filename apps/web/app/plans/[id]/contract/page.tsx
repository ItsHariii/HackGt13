import { FLAGSHIP_V8_SIGNATURE } from "@cartel/contracts/fixtures";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ContractDocument,
  type ContractMode,
} from "@/components/contract/contract-document";
import { PlanHeader } from "@/components/plan/plan-header";
import { loadStoredContract, type StoredContract } from "@/lib/contract-data";
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
  const q = await searchParams;
  if (id !== FLAGSHIP) {
    const v = one(q.v);
    const stored = await loadStoredContract(
      id,
      v && /^\d+$/.test(v) ? Number(v) : undefined,
    );
    if (!stored) notFound();
    return <StoredContractPage planId={id} stored={stored} />;
  }
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

const STATUS_TEXT: Record<string, string> = {
  armed: "Its standing mandate is armed.",
  executing: "Checkout is running.",
  executed: "Paid within the signed maximum.",
  superseded: "A newer version replaced it.",
  expired: "It expired before checkout.",
  signed: "Ready for checkout.",
  failed: "Checkout failed; nothing more will run under it.",
  invalidated: "It was invalidated and can't be used.",
};

/** A saved plan's contract: real versions, signed with Phase 12 passkeys. */
function StoredContractPage({
  planId,
  stored,
}: {
  planId: string;
  stored: StoredContract;
}) {
  const { view } = stored;
  const unsigned = ["draft", "awaiting_signature"].includes(stored.status);
  const mode: ContractMode = unsigned
    ? {
        kind: "review",
        ...(stored.status === "awaiting_signature"
          ? { versionId: stored.versionId }
          : {}),
      }
    : {
        kind: "signed",
        status: STATUS_TEXT[stored.status] ?? `Status: ${stored.status}.`,
        statusHref: `/plans/${planId}/checkout`,
      };
  return (
    <div
      data-blueprint
      className="min-h-dvh bg-[#f7f3ea] text-graphite dark:bg-paper"
    >
      <PlanHeader
        back={{ href: `/plans/${planId}`, label: view.title }}
        step={4}
      />
      <main className="flex flex-col gap-6 px-4 pt-6 sm:px-6">
        {stored.versions.length > 1 && (
          <nav
            aria-label="Contract versions"
            className="flex flex-wrap justify-center gap-2"
          >
            {stored.versions.map((x) => (
              <Link
                key={x.version}
                href={`/plans/${planId}/contract?v=${x.version}`}
                aria-current={x.version === view.version ? "page" : undefined}
                className={cn(
                  "inline-flex h-8 items-center rounded-pill border px-3 font-semibold text-small",
                  x.version === view.version
                    ? "border-graphite bg-paper-raised"
                    : "border-rule text-muted hover:border-graphite",
                )}
              >
                v{x.version} · {x.status.replace(/_/g, " ")}
              </Link>
            ))}
          </nav>
        )}
        <ContractDocument
          view={view}
          mode={mode}
          revision={stored.revision ?? undefined}
        />
      </main>
    </div>
  );
}
