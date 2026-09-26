import { ContractBody, MandateTrigger } from "@cartel/contracts";
import Link from "next/link";
import { MandateActionButton } from "@/components/mandates/mandate-action-button";
import { createClient } from "@/lib/supabase/server";
import { armMandateAction, cancelMandateAction } from "./actions";

export const dynamic = "force-dynamic";

const usd = (minor: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    minor / 100,
  );
const when = (iso: string | null) =>
  iso
    ? `${new Intl.DateTimeFormat("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "UTC",
      }).format(new Date(iso))} UTC`
    : "—";

function describe(trigger: MandateTrigger) {
  switch (trigger.type) {
    case "price_lte":
      return `Execute when ${trigger.sku} is ≤ ${usd(trigger.amountMinor)}`;
    case "back_in_stock":
      return `Execute when ${trigger.sku} is back in stock`;
    case "recurring":
      return `Execute once for the period ${trigger.every}`;
  }
}

const STATUS: Record<string, string> = {
  armed: "Armed · watching",
  fired_executed: "Fired · checkout ran",
  fired_blocked: "Fired · no payment was made",
  expired: "Expired",
  cancelled: "Cancelled",
};

function outcomeText(outcome: unknown): string | null {
  const o = (outcome ?? {}) as { status?: string; code?: string };
  switch (o.status) {
    case "paid":
      return "Paid within your signed limits.";
    case "declined":
      return "The card was declined. Retrying needs your click.";
    case "paused":
      return "The re-check found a change you didn't approve. Purchase paused.";
    case "no_instrument":
      return "No enrolled card, so nothing was charged.";
    case "error":
      return `Stopped before payment (${o.code}).`;
    case "not_fired":
      return "Last check: the trigger has not fired yet.";
    default:
      return o.status?.startsWith("contract_")
        ? `The contract moved to ${o.status.slice(9)} first.`
        : null;
  }
}

type Row = {
  id: string;
  status: string;
  trigger: unknown;
  not_after: string;
  next_check_at: string;
  last_checked_at: string | null;
  fired_at: string | null;
  outcome: unknown;
  contract_versions: { id: string; plan_id: string; version: number };
};

export default async function MandatesPage() {
  const client = await createClient();
  const user = client ? (await client.auth.getUser()).data.user : null;
  let mandates: Row[] = [];
  let ready: { id: string; plan_id: string; version: number; body: unknown }[] =
    [];
  if (client && user) {
    const [m, v] = await Promise.all([
      client
        .from("mandates")
        .select(
          "id,status,trigger,not_after,next_check_at,last_checked_at,fired_at,outcome,contract_versions!inner(id,plan_id,version)",
        )
        .order("created_at", { ascending: false })
        .limit(50),
      client
        .from("contract_versions")
        .select("id,plan_id,version,body")
        .eq("status", "signed")
        .not("body->mandate", "is", null)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);
    mandates = (m.data ?? []) as Row[];
    const used = new Set(mandates.map((r) => r.contract_versions.id));
    ready = (v.data ?? []).filter(
      (r) =>
        !used.has(r.id) &&
        (r.body as { mandate?: unknown } | null)?.mandate != null,
    );
  }

  return (
    <main className="mx-auto max-w-[1100px] px-5 py-10 sm:px-10">
      <h1 className="font-serif text-4xl">Standing mandates</h1>
      <p className="mt-2 max-w-2xl text-muted">
        A mandate is part of the contract you signed. When its trigger fires,
        Cartel re-checks the live checkout against that contract before any
        payment. A change you didn't approve pauses the purchase.
      </p>

      {!user ? (
        <p className="mt-10 text-muted">
          Start a plan to create a session, then sign a contract with a mandate.
        </p>
      ) : null}

      {ready.length > 0 ? (
        <section className="mt-10" aria-labelledby="ready-heading">
          <h2 id="ready-heading" className="font-serif text-2xl">
            Signed, not armed yet
          </h2>
          <ul className="mt-4 divide-y divide-border border-border border-y">
            {ready.map((v) => {
              const mandate = ContractBody.safeParse(v.body).data?.mandate;
              return (
                <li
                  key={v.id}
                  className="flex flex-wrap items-center justify-between gap-4 py-4"
                >
                  <div>
                    <p className="font-semibold">
                      {mandate ? describe(mandate.trigger) : "Mandate"}
                    </p>
                    <p className="text-muted text-small">
                      Contract v{v.version} · before{" "}
                      {when(mandate?.notAfter ?? null)}
                    </p>
                  </div>
                  <MandateActionButton
                    action={armMandateAction}
                    name="versionId"
                    value={v.id}
                    label="Arm mandate"
                    pending="Arming…"
                  />
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {user ? (
        <section className="mt-10" aria-labelledby="mandates-heading">
          <h2 id="mandates-heading" className="font-serif text-2xl">
            Your mandates
          </h2>
          {mandates.length === 0 ? (
            <p className="mt-4 text-muted">
              No mandates yet. Add one when you sign a contract.
            </p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full border-border border-y text-left text-small">
                <caption className="sr-only">
                  Standing mandates, newest first
                </caption>
                <thead>
                  <tr>
                    <th className="py-3 pr-4">Mandate</th>
                    <th className="py-3 pr-4">Status</th>
                    <th className="py-3 pr-4">Next check</th>
                    <th className="py-3 pr-4">History</th>
                    <th className="py-3">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {mandates.map((m) => {
                    const t = MandateTrigger.safeParse(m.trigger).data;
                    return (
                      <tr key={m.id} className="border-border border-t">
                        <th className="py-4 pr-4 font-normal">
                          <span className="block font-semibold">
                            {t ? describe(t) : "Mandate"}
                          </span>
                          <span className="text-muted">
                            Contract v{m.contract_versions.version} · until{" "}
                            {when(m.not_after)}
                          </span>
                        </th>
                        <td className="py-4 pr-4">
                          {STATUS[m.status] ?? m.status}
                        </td>
                        <td className="py-4 pr-4 font-mono">
                          {m.status === "armed" ? when(m.next_check_at) : "—"}
                        </td>
                        <td className="py-4 pr-4">
                          <span className="block">
                            {outcomeText(m.outcome) ?? "Not checked yet."}
                          </span>
                          <span className="text-muted">
                            {m.fired_at
                              ? `Fired ${when(m.fired_at)}`
                              : `Last checked ${when(m.last_checked_at)}`}
                          </span>
                        </td>
                        <td className="py-4 text-right">
                          {m.status === "armed" ? (
                            <MandateActionButton
                              action={cancelMandateAction}
                              name="mandateId"
                              value={m.id}
                              label="Cancel mandate"
                              pending="Cancelling…"
                              tone="quiet"
                            />
                          ) : (
                            <Link
                              href={`/plans/${m.contract_versions.plan_id}/checkout`}
                              className="underline underline-offset-4"
                            >
                              Open checkout
                            </Link>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}
    </main>
  );
}
