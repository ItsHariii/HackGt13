"use client";
import { Clock, Fingerprint } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { ContractDiff, type DiffLine } from "@/components/cartel/contract-diff";
import { HashPill } from "@/components/cartel/hash-pill";
import { Figure } from "@/components/doodle/figure";
import { useSequence } from "@/components/doodle/use-frames";
import { StatusMark } from "@/components/paper/status-mark";
import { SignContract } from "@/components/signing/sign-contract";
import { type ContractView, signReady } from "@/lib/contract-view";
import { cn } from "@/lib/utils";

const SECTIONS = [
  ["intent", "Intent"],
  ["items", "Approved items"],
  ["rules", "Hard rules"],
  ["waivers", "Waivers"],
  ["economics", "Economics"],
  ["autonomy", "Autonomy"],
  ["mandate", "Standing mandate"],
  ["expires", "Expires"],
] as const;

type Preset = ContractView["autonomy"];
const PRESETS: { id: Preset; label: string }[] = [
  { id: "strict", label: "Strict" },
  { id: "balanced", label: "Balanced" },
  { id: "flexible", label: "Flexible" },
];
/** SDD §7.6, as drawn in the Contract design. */
const AUTONOMY_ROWS: { change: string; cells: [string, string, string] }[] = [
  { change: "Price drops", cells: ["Asks", "Auto", "Auto"] },
  { change: "Price rises within max", cells: ["Asks", "Asks", "Auto"] },
  {
    change: "Seller change",
    cells: ["Always asks", "Always asks", "Always asks"],
  },
  {
    change: "Rule fails",
    cells: ["Always blocks", "Always blocks", "Always blocks"],
  },
];

export type ContractMode =
  | { kind: "signed"; status: string; statusHref?: string | undefined }
  /** With `versionId`, a stored version that can really be signed (T12). */
  | { kind: "review"; versionId?: string | undefined };

/**
 * The purchase contract (TASKS T11.6; designs "Contract v2" and "Contract
 * Blueprint"). Signed versions are read-only with the Notary's stamp;
 * review mode adds waivers to tick, the autonomy choice, the mandate
 * builder and Sign with passkey, which stays disabled until every hard
 * rule passes or is waived.
 */
export function ContractDocument({
  view,
  mode,
  revision,
}: {
  view: ContractView;
  mode: ContractMode;
  revision?:
    | { lines: DiffLine[]; from: string; to: string; reason: string }
    | undefined;
}) {
  const review = mode.kind === "review";
  const [ticked, setTicked] = useState<Set<string>>(
    () =>
      new Set(
        review ? [] : view.rules.filter((r) => r.waived).map((r) => r.id),
      ),
  );
  const [preset, setPreset] = useState<Preset>(view.autonomy);
  const [mandateOn, setMandateOn] = useState(view.mandate !== null);
  const router = useRouter();
  const [signedHash, setSignedHash] = useState<string | null>(null);
  const versionId = mode.kind === "review" ? mode.versionId : undefined;
  // A stored body is what the passkey signs, so its terms can't be edited here.
  const locked = review && versionId !== undefined;
  const notaryPose = useSequence(["stamp1", "stamp2", "stamp3"], signedHash, {
    ms: 180,
    rest: "stamp3",
  });
  const gate = signReady(view, ticked);
  const id = useId();
  const waivable = view.rules.filter((r) => r.waivable);
  const passing = view.rules.filter((r) => r.status === "pass").length;

  const short = (h: string) =>
    h.startsWith("sha256:") ? `sha256:${h.slice(7, 11)}…${h.slice(-4)}` : h;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-10 pt-6 pb-40 lg:grid-cols-[200px_minmax(0,880px)_200px] lg:justify-center lg:pt-12">
      <nav
        aria-label="Contract sections"
        className="hidden pt-[120px] text-[14px] lg:block"
      >
        <p className="mb-2.5 font-bold text-[12px] text-muted tracking-[0.1em]">
          SECTIONS
        </p>
        <ol className="sticky top-6 flex flex-col gap-0.5">
          {SECTIONS.map(([key, label], i) => (
            <li key={key}>
              <a
                href={`#${id}-${key}`}
                className="flex gap-2.5 py-1.5 text-graphite no-underline hover:underline"
              >
                <span className="w-[18px] font-mono text-muted">{i + 1}</span>
                {label}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <article
        aria-labelledby={`${id}-title`}
        className="relative border border-graphite bg-paper-sheet px-6 pt-14 pb-[60px] font-serif text-graphite shadow-[0_1px_2px_rgb(43_42_40/.08)] outline outline-1 outline-graphite -outline-offset-[7px] sm:px-[88px] sm:pt-[72px]"
      >
        {view.signedAt && (
          <div className="absolute top-[218px] right-14 z-[2] hidden -rotate-[7deg] flex-col items-center gap-0.5 rounded-[3px] border-[3.5px] border-red-pen bg-paper-sheet/20 px-[18px] pt-2 pb-[7px] text-red-pen outline outline-[1.5px] outline-red-pen outline-offset-4 [filter:url(#stamp)] sm:flex">
            <span className="font-mono font-semibold text-[30px] leading-none tracking-[0.16em]">
              SIGNED v{view.version}
            </span>
            <span className="font-medium font-mono text-[14px] uppercase tracking-[0.12em]">
              {view.signedAt.replace(/ UTC$/, "")}
            </span>
          </div>
        )}
        <header className="flex flex-col gap-3.5 border-graphite border-b-[3px] border-double pb-[22px]">
          <p className="text-center font-sans font-semibold text-[12px] text-muted uppercase tracking-[0.14em]">
            {view.title}
            {revision ? ` · Revised from v${view.version - 1}` : ""}
          </p>
          <h1
            id={`${id}-title`}
            className="text-center font-bold text-[26px] uppercase leading-[1.1] tracking-[0.1em] sm:text-[34px]"
          >
            Purchase contract v{view.version}
          </h1>
          <p className="text-center font-mono text-[12.5px] text-muted">
            Contract No. {view.number} · {short(view.hash)}
          </p>
          <div className="flex flex-wrap items-center gap-4 font-sans text-[13.5px] text-graphite-2">
            <span>
              Between <span className="font-semibold">you (the Buyer)</span> and{" "}
              <span className="font-semibold">Cartel (the Agent)</span>
            </span>
            <HashPill hash={view.hash} />
          </div>
          {view.signedAt && (
            <span className="self-start font-sans font-semibold text-[13px] text-red-pen sm:hidden">
              Signed v{view.version} · {view.signedAt}
            </span>
          )}
        </header>

        {revision && (
          <section
            aria-label="Changes from the previous version"
            className="flex flex-col gap-3 pt-[30px]"
          >
            <p className="text-[16.5px] leading-[1.65]">{revision.reason}</p>
            <ContractDiff
              from={`v${view.version - 1}`}
              to={`v${view.version}`}
              lines={revision.lines}
              caption={`Changes · v${view.version - 1} → v${view.version}`}
            />
          </section>
        )}

        <Clause id={`${id}-intent`} n={1} title="Intent">
          <Para n="1.1">
            The Buyer asked for the following, in their own words:
            <blockquote className="mt-2.5 border-graphite border-l-2 py-0.5 pl-[18px] text-graphite-2 italic">
              “{view.intent}”
            </blockquote>
          </Para>
        </Clause>

        <Clause id={`${id}-items`} n={2} title="Approved items">
          <Para n="2.1" className="mb-3">
            Only these items, from merchant{" "}
            <span className="font-semibold">{view.merchant}</span>, may be
            purchased.
          </Para>
          <div
            // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrolling table must be reachable by keyboard (WCAG 2.1.1)
            tabIndex={0}
            className="overflow-x-auto sm:ml-10"
          >
            <table className="w-full min-w-[560px] border-graphite border-y font-sans">
              <thead>
                <tr className="border-graphite border-b text-left font-semibold text-[11.5px] text-muted tracking-[0.08em]">
                  <th scope="col" className="py-2 pr-3 font-semibold">
                    ITEM
                  </th>
                  <th scope="col" className="w-[110px] py-2 pr-3 font-semibold">
                    SKU
                  </th>
                  <th scope="col" className="w-[90px] py-2 pr-3 font-semibold">
                    SELLER
                  </th>
                  <th
                    scope="col"
                    className="w-10 py-2 pr-3 text-right font-semibold"
                  >
                    QTY
                  </th>
                  <th
                    scope="col"
                    className="w-[90px] py-2 text-right font-semibold"
                  >
                    UNIT
                  </th>
                </tr>
              </thead>
              <tbody>
                {view.items.map((it) => (
                  <tr
                    key={it.sku}
                    className="border-rule-soft border-b text-[14.5px] last:border-b-0"
                  >
                    <th
                      scope="row"
                      className="py-[9px] pr-3 text-left font-normal"
                    >
                      {it.title}
                    </th>
                    <td className="py-[9px] pr-3 font-mono text-[13px]">
                      {it.sku}
                    </td>
                    <td className="py-[9px] pr-3 text-[13.5px]">{it.seller}</td>
                    <td className="py-[9px] pr-3 text-right font-mono text-[13.5px]">
                      {it.qty}
                    </td>
                    <td className="num py-[9px] text-right text-[13.5px]">
                      {it.unit}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Clause>

        <Clause id={`${id}-rules`} n={3} title="Hard rules">
          <Para n="3.1" className="mb-2.5">
            Each rule below must pass against the live checkout before any
            payment.{" "}
            {passing === view.rules.length
              ? `All ${passing} pass today.`
              : `${passing} of ${view.rules.length} pass today${
                  waivable.length
                    ? `; ${waivable.length} can't be checked (§4)`
                    : ""
                }.`}
          </Para>
          <ol className="grid gap-x-7 font-sans sm:ml-10 sm:grid-cols-2">
            {view.rules.map((r, i) => (
              <li
                key={r.id}
                className={cn(
                  "grid grid-cols-[18px_30px_1fr] items-center gap-2 border-rule-soft border-b py-[7px] text-[14.5px]",
                  r.status === "fail" && "bg-red-pen-wash",
                )}
              >
                <StatusMark
                  status={r.status === "cant" ? "unknown" : r.status}
                  hideLabel
                  label={
                    r.status === "cant"
                      ? "Can't check, see §4"
                      : r.status === "fail"
                        ? "Fail"
                        : "Pass"
                  }
                />
                <span className="font-mono text-[12px] text-muted">
                  3.{i + 2}
                </span>
                <span>{r.text}</span>
              </li>
            ))}
          </ol>
          {view.preferences.length > 0 && (
            <p className="mt-2.5 font-sans text-[13.5px] text-muted sm:ml-10">
              Preferences (ranked, never blocking):{" "}
              {view.preferences.join("; ")}.
            </p>
          )}
        </Clause>

        <Clause id={`${id}-waivers`} n={4} title="Waivers">
          {waivable.length === 0 ? (
            <Para n="4.1">None. Every hard rule can be checked.</Para>
          ) : (
            waivable.map((r, i) => (
              <Para key={r.id} n={`4.${i + 1}`}>
                <span className="flex flex-wrap items-baseline gap-2.5">
                  <span className="inline-flex h-[22px] items-center gap-1 self-center rounded-[4px] border border-graphite px-[7px] font-sans font-semibold text-[12px]">
                    ? Can&apos;t check
                  </span>
                  {r.text}: Can&apos;t check.
                  {review ? (
                    <label className="flex min-h-6 items-center gap-2 font-sans font-semibold text-[14px]">
                      <input
                        type="checkbox"
                        checked={ticked.has(r.id)}
                        onChange={(e) =>
                          setTicked((t) => {
                            const next = new Set(t);
                            if (e.target.checked) next.add(r.id);
                            else next.delete(r.id);
                            return next;
                          })
                        }
                        className="size-4 accent-ink"
                      />
                      I accept this.
                    </label>
                  ) : (
                    <span>I accept this.</span>
                  )}
                </span>
                {r.reason && (
                  <span className="block font-sans text-[13.5px] text-muted">
                    {r.reason}
                  </span>
                )}
              </Para>
            ))
          )}
        </Clause>

        <Clause id={`${id}-economics`} n={5} title="Economics">
          <dl className="grid max-w-[520px] grid-cols-[1fr_auto] gap-y-2 text-[16px] sm:ml-10">
            <dt>Merchandise</dt>
            <dd className="num text-right text-[15px]">
              {view.economics.merchandise}
            </dd>
            <dt>Shipping</dt>
            <dd className="num text-right text-[15px]">
              {view.economics.shipping}
            </dd>
            <dt className="flex items-center gap-2">
              Estimated tax
              <span className="rounded-[4px] border border-pencil border-dashed px-1.5 py-px font-sans font-semibold text-[11.5px] text-muted">
                ~ Estimate
              </span>
            </dt>
            <dd className="num text-right text-[15px]">{view.economics.tax}</dd>
            <dt className="border-graphite border-t pt-2 font-semibold">
              Delivered total
            </dt>
            <dd className="num border-graphite border-t pt-2 text-right font-semibold text-[16px]">
              {view.economics.total}
            </dd>
          </dl>
          <div className="mt-3.5 flex max-w-[520px] items-center justify-between border-2 border-graphite px-4 py-3 sm:ml-10">
            <span className="font-bold font-sans text-[13px] tracking-[0.12em]">
              MAXIMUM TOTAL
            </span>
            <span className="num font-semibold text-[22px]">
              {view.economics.max}
            </span>
          </div>
          <Para n="5.1" className="mt-3">
            No payment may exceed the maximum total, including tax and shipping.
          </Para>
        </Clause>

        <Clause id={`${id}-autonomy`} n={6} title="Autonomy">
          <Para n="6.1" className="mb-3.5">
            What the Agent may accept without asking the Buyer.
          </Para>
          <fieldset className="font-sans sm:ml-10" disabled={!review || locked}>
            <legend className="sr-only">Autonomy preset</legend>
            <div
              // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrolling table must be reachable by keyboard (WCAG 2.1.1)
              tabIndex={0}
              className="overflow-x-auto"
            >
              <table className="w-full min-w-[560px] border border-graphite text-[13.5px]">
                <thead>
                  <tr>
                    <td className="w-[170px]" />
                    {PRESETS.map((p) => (
                      <th
                        key={p.id}
                        scope="col"
                        className={cn(
                          "h-11 border-graphite border-l px-3.5 text-left font-medium text-[14.5px]",
                          preset === p.id &&
                            "bg-graphite font-semibold text-paper-sheet",
                        )}
                      >
                        <label className="flex cursor-pointer items-center gap-2">
                          <input
                            type="radio"
                            name={`${id}-preset`}
                            value={p.id}
                            checked={preset === p.id}
                            onChange={() => setPreset(p.id)}
                            className="peer sr-only"
                          />
                          <span
                            aria-hidden="true"
                            className={cn(
                              "size-4 shrink-0 rounded-full peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-ink peer-focus-visible:outline-offset-2",
                              preset === p.id
                                ? "border-[5px] border-paper-sheet"
                                : "border-[1.5px] border-graphite",
                            )}
                          />
                          {p.label}
                        </label>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {AUTONOMY_ROWS.map((row) => (
                    <tr key={row.change}>
                      <th
                        scope="row"
                        className="border-rule border-t px-3.5 py-2.5 text-left font-semibold"
                      >
                        {row.change}
                      </th>
                      {row.cells.map((c, i) => (
                        <td
                          // biome-ignore lint/suspicious/noArrayIndexKey: one cell per preset
                          key={i}
                          className={cn(
                            "border-rule border-t border-l border-l-graphite px-3.5 py-2.5",
                            PRESETS[i]?.id === preset
                              ? "bg-[#f4f1ea] font-semibold dark:bg-paper-shade"
                              : "text-graphite-2",
                          )}
                        >
                          {c}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </fieldset>
          {locked && (
            <p className="mt-2 font-sans text-[13.5px] text-muted sm:ml-10">
              Set when this version was drafted. Your passkey signs exactly
              these terms; changing them creates v{view.version + 1}.
            </p>
          )}
        </Clause>

        <Clause id={`${id}-mandate`} n={7} title="Standing mandate">
          {review && !locked ? (
            <div className="sm:ml-10">
              <MandateBuilder
                view={view}
                on={mandateOn}
                onToggle={setMandateOn}
              />
            </div>
          ) : view.mandate ? (
            <>
              <Para n="7.1" className="font-semibold">
                {view.mandate.text}
              </Para>
              <Para n="7.2" className="mt-2">
                At execution, Cartel re-checks every rule in §3 against the live
                checkout. If any rule fails, the purchase pauses and no payment
                is made.
              </Para>
            </>
          ) : (
            <Para n="7.1">
              None. Payment runs only when you start checkout.
            </Para>
          )}
        </Clause>

        <Clause id={`${id}-expires`} n={8} title="Expires">
          <Para n="8.1">
            Issued {view.issued}. This contract expires {view.expires}, or when
            executed, whichever comes first. Any change creates v
            {view.version + 1}.
          </Para>
        </Clause>

        <footer className="mt-10 grid items-end gap-6 border-graphite border-t pt-[22px] font-sans shadow-[0_-3px_0_-2px_var(--color-graphite)] sm:grid-cols-[1fr_auto]">
          <div className="flex flex-col gap-2">
            <span className="font-semibold text-[11.5px] text-muted tracking-[0.1em]">
              BUYER SIGNATURE
            </span>
            {view.signedAt || signedHash ? (
              <>
                <span className="flex h-[30px] w-full max-w-[340px] items-end border-graphite border-b pb-1 font-mono text-[13.5px]">
                  passkey · {short(signedHash ?? view.hash)}
                </span>
                <span className="text-[13px] text-graphite-2">
                  Signed with passkey
                  {view.signedAt ? ` · ${view.signedAt}` : ""}
                </span>
              </>
            ) : (
              <>
                <span className="block h-[30px] w-full max-w-[340px] border-graphite border-b" />
                <span className="text-[13px] text-muted">Not signed</span>
              </>
            )}
          </div>
          <span className="font-mono text-[12.5px] text-muted">
            v{view.version} · {short(view.hash)} · page 1 of 1
          </span>
        </footer>
      </article>

      <aside aria-hidden="true" className="relative hidden lg:block">
        {(view.signedAt || signedHash) && (
          <div className="sticky top-10 -ml-3.5 flex flex-col gap-3 pt-10">
            <Figure
              who="notary"
              pose={signedHash ? notaryPose : "stamp3"}
              h={180}
            />
            <p className="w-[180px] text-[13px] text-muted leading-normal">
              The Notary stamps only after your passkey.
            </p>
          </div>
        )}
      </aside>

      <div className="fixed inset-x-0 bottom-0 z-10 flex min-h-32 items-center justify-center border-graphite border-t bg-paper-sheet px-5 py-4">
        {mode.kind === "signed" ? (
          <div className="flex flex-wrap items-center justify-center gap-x-[22px] gap-y-3">
            <span
              aria-hidden="true"
              className="flex size-11 items-center justify-center rounded-full border-2 border-graphite"
            >
              <Clock size={20} strokeWidth={1.8} />
            </span>
            <div className="flex flex-col gap-[3px]">
              <p
                aria-live="polite"
                className="font-semibold font-serif text-[20px] tracking-[-0.015em] sm:text-[22px]"
              >
                Signed v{view.version}. {mode.status}
              </p>
              {view.mandate && (
                <p className="text-[14px] text-muted">{view.mandate.text}</p>
              )}
            </div>
            {mode.statusHref && (
              <Link
                href={mode.statusHref}
                className="ml-0 inline-flex h-11 items-center rounded-card border border-graphite bg-paper-raised px-[18px] font-medium text-[14.5px] text-graphite no-underline hover:bg-paper sm:ml-10"
              >
                View
              </Link>
            )}
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
            {versionId && gate.ready ? (
              <SignContract
                contractVersionId={versionId}
                version={view.version}
                onSigned={({ bodyHash }) => {
                  setSignedHash(bodyHash);
                  router.refresh();
                }}
              />
            ) : (
              <div className="flex flex-col items-center gap-2.5">
                <button
                  type="button"
                  disabled
                  className="flex h-[60px] min-w-[min(360px,90vw)] items-center justify-center gap-3 rounded-card bg-graphite px-8 font-semibold text-[17px] text-paper-raised disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Fingerprint size={22} strokeWidth={1.6} aria-hidden="true" />
                  Sign with passkey
                </button>
                <p className="text-[14px] text-graphite-2 leading-normal">
                  {versionId
                    ? `Touch ID signs this exact version. Any change creates v${view.version + 1}.`
                    : "Demo contracts aren't stored, so they can't be signed. Signing works on your saved plans."}
                </p>
              </div>
            )}
            {!gate.ready && (
              <div
                role="note"
                aria-label="Why signing is disabled"
                className="max-w-[420px] border-red-pen border-l-2 pl-3 text-small"
              >
                <p className="font-semibold text-red-pen">
                  Sign is disabled until:
                </p>
                <ul className="list-disc pl-4">
                  {gate.reasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** A numbered paragraph: the number in a 40 px column, like the design. */
function Para({
  n,
  className,
  children,
}: {
  n: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-[40px_1fr] text-[16.5px] leading-[1.65]",
        className,
      )}
    >
      <span className="font-semibold">{n}</span>
      <div>{children}</div>
    </div>
  );
}

function Clause({
  id,
  n,
  title,
  children,
}: {
  id: string;
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-h`}
      className="scroll-mt-6 pt-[30px]"
    >
      <h2
        id={`${id}-h`}
        className="mb-3.5 border-graphite border-b pb-1.5 font-bold font-serif text-[15px] uppercase tracking-[0.14em]"
      >
        §{n} {title}
      </h2>
      {children}
    </section>
  );
}

function MandateBuilder({
  view,
  on,
  onToggle,
}: {
  view: ContractView;
  on: boolean;
  onToggle: (on: boolean) => void;
}) {
  const id = useId();
  const [sku, setSku] = useState(
    view.items.find((i) => i.role === "monitor")?.sku ??
      view.items[0]?.sku ??
      "",
  );
  const [amount, setAmount] = useState("");
  const [notAfter, setNotAfter] = useState("");
  const item = view.items.find((i) => i.sku === sku);
  return (
    <div className="flex flex-col gap-3 font-sans text-ui">
      <label className="flex min-h-6 items-center gap-2 font-semibold">
        <input
          type="checkbox"
          checked={on}
          onChange={(e) => onToggle(e.target.checked)}
          className="size-4 accent-ink"
        />
        Buy automatically when a price target is met
      </label>
      {on ? (
        <div className="flex flex-wrap items-end gap-3 text-small">
          <label className="flex flex-col gap-1">
            When
            <select
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              className="h-10 rounded-card border border-rule bg-paper-sheet px-2.5"
            >
              {view.items.map((i) => (
                <option key={i.sku} value={i.sku}>
                  {i.title}
                </option>
              ))}
            </select>
          </label>
          <label htmlFor={`${id}-amt`} className="flex flex-col gap-1">
            is at most (USD)
            <input
              id={`${id}-amt`}
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={item?.unit.replace("$", "")}
              className="num h-10 w-28 rounded-card border border-rule bg-paper-sheet px-2.5"
            />
          </label>
          <label className="flex flex-col gap-1">
            not after
            <input
              type="date"
              value={notAfter}
              onChange={(e) => setNotAfter(e.target.value)}
              className="h-10 rounded-card border border-rule bg-paper-sheet px-2.5"
            />
          </label>
          <p className="w-full text-muted">
            The mandate can't outlive the contract ({view.expires}). When it
            fires, the guard re-checks every rule before paying.
          </p>
        </div>
      ) : (
        <p className="text-muted">
          No mandate. Payment runs only when you start checkout.
        </p>
      )}
    </div>
  );
}
