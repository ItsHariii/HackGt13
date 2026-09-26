import { FLAGSHIP_REQUIREMENTS } from "@cartel/contracts/fixtures";
import type { Metadata } from "next";
import Link from "next/link";
import { CheckoutTierBadge } from "@/components/cartel/checkout-tier-badge";
import { EvidenceBadge } from "@/components/cartel/evidence-badge";
import { StatusMark } from "@/components/paper/status-mark";
import { StateCard } from "@/components/states/edge-states";
import { findProduct } from "@/lib/catalog-read";
import { DEMO_NOW } from "@/lib/demo-catalog";
import { ALL_PACKS } from "@/lib/evidence";
import { type ProductView, productView } from "@/lib/product-view";

export const metadata: Metadata = { title: "Compare products" };

const MARK = {
  pass: "pass",
  fail: "fail",
  unknown: "unknown",
  estimate: "estimate",
} as const;

/** Rule-by-rule compare for up to four products (TASKS T11.19 CompareTray). */
export default async function CompareProducts({
  searchParams,
}: PageProps<"/compare">) {
  const raw = (await searchParams).ids;
  const ids = ((Array.isArray(raw) ? raw[0] : raw) ?? "")
    .split(",")
    .map((s) => decodeURIComponent(s.trim()))
    .filter(Boolean)
    .slice(0, 4);
  const found = await Promise.all(ids.map(findProduct));
  const views: ProductView[] = found.flatMap((f) =>
    f.status === "ok"
      ? [
          productView(
            f.product,
            FLAGSHIP_REQUIREMENTS,
            ALL_PACKS,
            f.demo ? DEMO_NOW : new Date().toISOString(),
          ),
        ]
      : [],
  );
  const rules = [...new Set(views.flatMap((v) => v.checks.map((c) => c.rule)))];
  const specs = [
    ...new Map(
      views.flatMap((v) => v.specs.map((s) => [s.field, s.label] as const)),
    ).entries(),
  ];
  return (
    <main className="dot-grid min-h-[70vh] text-graphite">
      <div className="mx-auto flex max-w-[1240px] flex-col gap-6 px-5 py-12 sm:px-8">
        <h1 className="font-semibold font-serif text-h2 tracking-heading">
          Compare products
        </h1>
        {views.length < 2 ? (
          <StateCard title="Pick at least two products." eyebrow="Compare">
            Tick “Compare” on up to four products in{" "}
            <Link href="/search" className="text-ink underline">
              search
            </Link>
            , then open the compare tray.
          </StateCard>
        ) : (
          <div
            // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrolling table must be reachable by keyboard (WCAG 2.1.1)
            tabIndex={0}
            className="overflow-x-auto"
          >
            <table className="sheet-formal w-full min-w-[720px] border-collapse text-left text-small">
              <caption className="pb-2 text-left text-muted">
                Rules from your active plan (Home office), then each spec with
                its receipt.
              </caption>
              <thead>
                <tr className="border-graphite border-b">
                  <th scope="col" className="px-3 py-3">
                    <span className="sr-only">Row</span>
                  </th>
                  {views.map((v) => (
                    <th key={v.id} scope="col" className="px-3 py-3 align-top">
                      <Link
                        href={`/p/${encodeURIComponent(v.id)}`}
                        className="font-semibold text-ui hover:underline"
                      >
                        {v.title}
                      </Link>
                      <span className="mt-1 flex flex-wrap items-center gap-2 font-normal">
                        <span className="num text-ink">
                          {v.offers[0]?.price ?? "—"}
                        </span>
                        {v.offers[0] && (
                          <CheckoutTierBadge tier={v.offers[0].tier} />
                        )}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rules.map((rule) => (
                  <tr key={rule} className="border-rule-soft border-b">
                    <th scope="row" className="px-3 py-2.5 font-semibold">
                      {rule}
                    </th>
                    {views.map((v) => {
                      const c = v.checks.find((x) => x.rule === rule);
                      return (
                        <td
                          key={v.id}
                          className={
                            c?.status === "fail"
                              ? "bg-red-pen-wash px-3 py-2.5"
                              : "px-3 py-2.5"
                          }
                        >
                          {c ? (
                            <span className="flex flex-col gap-0.5">
                              <StatusMark status={MARK[c.status]} />
                              <span className="num text-muted">{c.value}</span>
                            </span>
                          ) : (
                            <span className="text-muted">Doesn't apply</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {specs.map(([field, label]) => (
                  <tr
                    key={field}
                    className="border-rule-soft border-b last:border-0"
                  >
                    <th
                      scope="row"
                      className="px-3 py-2.5 font-semibold text-muted"
                    >
                      {label}
                    </th>
                    {views.map((v) => {
                      const s = v.specs.find((x) => x.field === field);
                      return (
                        <td key={v.id} className="px-3 py-2.5">
                          {s ? (
                            <span className="flex flex-wrap items-center gap-2">
                              <span className="num">{s.value}</span>
                              <EvidenceBadge level={s.level} />
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
