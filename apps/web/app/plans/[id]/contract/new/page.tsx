import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PlanHeader } from "@/components/plan/plan-header";
import { loadStoredContract } from "@/lib/contract-data";
import { loadStoredSolve } from "@/lib/stored-workspace";
import { DraftForm } from "./draft-form";

export const metadata: Metadata = { title: "Draft contract" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Draft the contract for one solved plan (TASKS T11.6). */
export default async function NewContractPage({
  params,
  searchParams,
}: PageProps<"/plans/[id]/contract/new">) {
  const { id } = await params;
  const wanted = one((await searchParams).plan);
  const solve = await loadStoredSolve(id, wanted);
  if (!solve) notFound();
  if (solve.kind !== "solved") redirect(`/plans/${id}`);
  const { view } = solve;
  const plan = view.plans[view.activePlan ?? 0];
  if (!plan) redirect(`/plans/${id}`);
  const label = plan.label.replace(/^Plan /, "");
  const open = await loadStoredContract(id);
  const cant = view.proof.rows
    .filter((r) => r.hard && r.kind === "cant")
    .map((r) => ({
      requirementId: r.requirementId,
      rule: r.rule,
      evidence: r.evidence,
    }));
  return (
    <div className="dot-grid min-h-dvh text-graphite">
      <PlanHeader
        back={{ href: `/plans/${id}?plan=${label}`, label: view.title }}
        step={4}
      />
      <main className="mx-auto flex max-w-[880px] flex-col gap-8 px-5 py-12">
        <div className="flex flex-col gap-2">
          <p className="font-semibold text-meta text-muted uppercase tracking-label">
            {view.title} · {plan.label}
          </p>
          <h1 className="font-semibold font-serif text-h3 tracking-heading sm:text-h2">
            Draft the contract
          </h1>
          <p className="max-w-[62ch] text-graphite-2 text-ui">
            Cartel opens a real GreatHub checkout for these items, proves it
            again, and writes the contract from that checkout. You review and
            sign it next; nothing is paid until you run checkout.
          </p>
        </div>

        {open &&
          ["awaiting_signature", "signed", "armed"].includes(open.status) && (
            <p className="rounded-card border border-rule bg-paper-raised p-4 text-small">
              Contract v{open.view.version} is{" "}
              {open.status === "awaiting_signature"
                ? "waiting for your signature"
                : "signed"}
              .{" "}
              <Link
                href={`/plans/${id}/contract`}
                className="text-ink underline underline-offset-4"
              >
                Open it
              </Link>{" "}
              or draft a new version below.
            </p>
          )}

        <section
          aria-label="This plan"
          className="rounded-card border border-graphite bg-paper-raised p-5 shadow-stack-1"
        >
          <ul className="flex flex-col gap-2">
            {plan.items.map((it) => (
              <li
                key={`${it.role}:${it.title}`}
                className="flex justify-between gap-4"
              >
                <span>
                  <span className="text-muted">{it.role}: </span>
                  {it.title}
                </span>
                <span className="num">{it.price}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 flex justify-between border-rule-soft border-t pt-3 font-semibold">
            <span>Delivered total at the last check</span>
            <span className="num">{plan.total}</span>
          </p>
        </section>

        <DraftForm planId={id} label={label} cant={cant} />
      </main>
    </div>
  );
}
