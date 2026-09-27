"use client";
import { Clock, Fingerprint } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { ContractDiff, type DiffLine } from "@/components/cartel/contract-diff";
import { HashPill } from "@/components/cartel/hash-pill";
import { Figure } from "@/components/doodle/figure";
import { useSequence } from "@/components/doodle/use-frames";
import { Stamp } from "@/components/paper/stamp";
import { StatusMark } from "@/components/paper/status-mark";
import { SignContract } from "@/components/signing/sign-contract";
import { Button } from "@/components/ui/button";
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

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 pb-32 lg:grid-cols-[180px_minmax(0,880px)_180px] lg:justify-center">
      <nav aria-label="Contract sections" className="hidden lg:block">
        <p className="mb-2 font-semibold text-meta text-muted uppercase tracking-label">
          Sections
        </p>
        <ol className="sticky top-6 flex flex-col gap-1 text-small">
          {SECTIONS.map(([key, label], i) => (
            <li key={key}>
              <a
                href={`#${id}-${key}`}
                className="flex min-h-7 items-center gap-2 rounded-[5px] px-2 hover:bg-paper-raised"
              >
                <span className="num text-muted">{i + 1}</span>
                {label}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <article
        aria-labelledby={`${id}-title`}
        className="sheet-formal relative flex flex-col gap-8 px-6 py-10 text-graphite outline outline-1 outline-rule -outline-offset-[7px] sm:px-14"
      >
        <header className="flex flex-col items-center gap-2 text-center">
          <p className="font-semibold text-meta text-muted uppercase tracking-[0.1em]">
            {view.title}
            {revision ? ` · Revised from v${view.version - 1}` : ""}
          </p>
          <h1
            id={`${id}-title`}
            className="font-semibold font-serif text-h3 uppercase tracking-[0.1em]"
          >
            Purchase contract v{view.version}
          </h1>
          <p className="font-serif text-graphite-2 text-ui italic">
            Between you (the Buyer) and Cartel (the Agent)
          </p>
          <p className="flex flex-wrap items-center justify-center gap-2 text-muted text-small">
            Contract No. <span className="num">{view.number}</span> ·
            <HashPill hash={view.hash} />
          </p>
          {view.signedAt && (
            <div className="rotate-[-6deg] md:absolute md:top-6 md:right-8">
              <Stamp tone="signed" detail={view.signedAt}>
                {`SIGNED v${view.version}`}
              </Stamp>
            </div>
          )}
        </header>

        {revision && (
          <section
            aria-label="Changes from the previous version"
            className="flex flex-col gap-3"
          >
            <p className="font-serif text-body">{revision.reason}</p>
            <ContractDiff
              from={`v${view.version - 1}`}
              to={`v${view.version}`}
              lines={revision.lines}
              caption={`Changes · v${view.version - 1} → v${view.version}`}
            />
          </section>
        )}

        <Clause id={`${id}-intent`} n={1} title="Intent">
          <p>1.1 What you asked for, in your words:</p>
          <blockquote className="border-rule border-l-2 pl-4 italic">
            “{view.intent}”
          </blockquote>
        </Clause>

        <Clause id={`${id}-items`} n={2} title="Approved items">
          <p>
            2.1 Only these items, from merchant {view.merchant}, may be
            purchased.
          </p>
          <div
            // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrolling table must be reachable by keyboard (WCAG 2.1.1)
            tabIndex={0}
            className="relative overflow-x-auto"
          >
            <table className="w-full min-w-[560px] border-collapse text-left font-sans text-small">
              <thead className="text-meta text-muted uppercase tracking-label">
                <tr className="border-graphite border-b">
                  <th scope="col" className="py-2 pr-3 font-semibold">
                    Item
                  </th>
                  <th scope="col" className="py-2 pr-3 font-semibold">
                    SKU
                  </th>
                  <th scope="col" className="py-2 pr-3 font-semibold">
                    Seller
                  </th>
                  <th
                    scope="col"
                    className="py-2 pr-3 text-right font-semibold"
                  >
                    Qty
                  </th>
                  <th scope="col" className="py-2 text-right font-semibold">
                    Unit
                  </th>
                </tr>
              </thead>
              <tbody>
                {view.items.map((it) => (
                  <tr key={it.sku} className="border-rule-soft border-b">
                    <th scope="row" className="py-2 pr-3 font-semibold">
                      {it.title}
                    </th>
                    <td className="num py-2 pr-3">{it.sku}</td>
                    <td className="num py-2 pr-3 text-muted">{it.seller}</td>
                    <td className="num py-2 pr-3 text-right">{it.qty}</td>
                    <td className="num py-2 text-right">{it.unit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Clause>

        <Clause id={`${id}-rules`} n={3} title="Hard rules">
          <p>
            3.1 Each rule below must pass against the live checkout before any
            payment. {passing} of {view.rules.length} pass today
            {waivable.length
              ? `; ${waivable.length} can't be checked (§4)`
              : ""}
            .
          </p>
          <ol className="flex flex-col font-sans text-ui">
            {view.rules.map((r, i) => (
              <li
                key={r.id}
                className={cn(
                  "flex flex-wrap items-center justify-between gap-2 border-rule-soft border-b py-2",
                  r.status === "fail" && "bg-red-pen-wash px-2",
                )}
              >
                <span>
                  <span className="num mr-2 text-muted">3.{i + 2}</span>
                  {r.text}
                </span>
                <StatusMark
                  status={r.status === "cant" ? "unknown" : r.status}
                  label={
                    r.status === "cant" ? "Can't check · see §4" : undefined
                  }
                />
              </li>
            ))}
          </ol>
          {view.preferences.length > 0 && (
            <p className="text-muted text-small">
              Preferences (ranked, never blocking):{" "}
              {view.preferences.join("; ")}.
            </p>
          )}
        </Clause>

        <Clause id={`${id}-waivers`} n={4} title="Waivers">
          {waivable.length === 0 ? (
            <p>4.1 None. Every hard rule can be checked.</p>
          ) : (
            waivable.map((r, i) => (
              <div
                key={r.id}
                className="flex flex-wrap items-center gap-3 rounded-card border border-graphite border-dashed px-4 py-3 font-sans"
              >
                <span className="num text-muted">4.{i + 1}</span>
                <span className="flex-1">
                  <span className="font-semibold">
                    ? Can't check — {r.text}.
                  </span>{" "}
                  <span className="text-muted">{r.reason}</span>
                </span>
                {review ? (
                  <label className="flex min-h-6 items-center gap-2 font-semibold text-small">
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
                    I accept this
                  </label>
                ) : (
                  <span className="font-semibold text-small">
                    Accepted by you
                  </span>
                )}
              </div>
            ))
          )}
        </Clause>

        <Clause id={`${id}-economics`} n={5} title="Economics">
          <dl className="grid max-w-[420px] grid-cols-[1fr_auto] gap-x-6 gap-y-1.5 font-sans text-ui">
            <dt>Merchandise</dt>
            <dd className="num text-right">{view.economics.merchandise}</dd>
            <dt>Shipping</dt>
            <dd className="num text-right">{view.economics.shipping}</dd>
            <dt className="flex items-center gap-2">
              Estimated tax
              <span className="rounded-[4px] border border-pencil border-dashed px-1.5 text-meta text-muted">
                ~ Estimate
              </span>
            </dt>
            <dd className="num text-right">{view.economics.tax}</dd>
            <dt className="border-rule border-t pt-1.5 font-semibold">
              Delivered total
            </dt>
            <dd className="num border-rule border-t pt-1.5 text-right font-semibold">
              {view.economics.total}
            </dd>
          </dl>
          <div className="flex w-fit flex-col gap-1 border-2 border-graphite px-5 py-3 font-sans">
            <span className="font-semibold text-meta uppercase tracking-label">
              Maximum total
            </span>
            <span className="num font-semibold text-[26px]">
              {view.economics.max}
            </span>
          </div>
          <p>
            5.1 No payment may exceed the maximum total, including tax and
            shipping.
          </p>
        </Clause>

        <Clause id={`${id}-autonomy`} n={6} title="Autonomy">
          <p>6.1 What the Agent may accept without asking the Buyer.</p>
          <fieldset className="font-sans" disabled={!review || locked}>
            <legend className="sr-only">Autonomy preset</legend>
            <div className="flex flex-wrap gap-2 pb-3">
              {PRESETS.map((p) => (
                <label
                  key={p.id}
                  className={cn(
                    "flex h-10 items-center gap-2 rounded-card border px-4 font-semibold text-ui",
                    preset === p.id
                      ? "border-graphite bg-paper-raised"
                      : "border-rule text-muted",
                  )}
                >
                  <input
                    type="radio"
                    name={`${id}-preset`}
                    value={p.id}
                    checked={preset === p.id}
                    onChange={() => setPreset(p.id)}
                    className="accent-ink"
                  />
                  {p.label}
                </label>
              ))}
            </div>
          </fieldset>
          {locked && (
            <p className="font-sans text-muted text-small">
              Set when this version was drafted. Your passkey signs exactly
              these terms; changing them creates v{view.version + 1}.
            </p>
          )}
          <div
            // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrolling table must be reachable by keyboard (WCAG 2.1.1)
            tabIndex={0}
            className="relative overflow-x-auto"
          >
            <table className="w-full min-w-[520px] border-collapse text-left font-sans text-small">
              <thead className="text-meta text-muted uppercase tracking-label">
                <tr className="border-graphite border-b">
                  <th scope="col" className="py-2 pr-3 font-semibold">
                    Change
                  </th>
                  {PRESETS.map((p) => (
                    <th
                      key={p.id}
                      scope="col"
                      className={cn(
                        "py-2 pr-3 font-semibold",
                        preset === p.id && "text-graphite",
                      )}
                    >
                      {p.label}
                      {preset === p.id && (
                        <span className="sr-only"> (selected)</span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {AUTONOMY_ROWS.map((row) => (
                  <tr key={row.change} className="border-rule-soft border-b">
                    <th scope="row" className="py-2 pr-3 font-semibold">
                      {row.change}
                    </th>
                    {row.cells.map((c, i) => (
                      <td
                        // biome-ignore lint/suspicious/noArrayIndexKey: one cell per preset
                        key={i}
                        className={cn(
                          "py-2 pr-3",
                          PRESETS[i]?.id === preset
                            ? "font-semibold"
                            : "text-muted",
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
        </Clause>

        <Clause id={`${id}-mandate`} n={7} title="Standing mandate">
          {review && !locked ? (
            <MandateBuilder
              view={view}
              on={mandateOn}
              onToggle={setMandateOn}
            />
          ) : view.mandate ? (
            <p>7.1 {view.mandate.text}</p>
          ) : (
            <p>7.1 None. Payment runs only when you start checkout.</p>
          )}
        </Clause>

        <Clause id={`${id}-expires`} n={8} title="Expires">
          <p>
            8.1 Issued {view.issued}. This version expires {view.expires}. Any
            change creates v{view.version + 1}.
          </p>
        </Clause>
      </article>

      <aside aria-hidden="true" className="hidden lg:block">
        {(view.signedAt || signedHash) && (
          <div className="sticky top-40 flex flex-col items-center gap-2 text-center">
            <Figure
              who="notary"
              pose={signedHash ? notaryPose : "stamp3"}
              h={96}
            />
            <p className="text-muted text-small">
              The Notary stamps only after your passkey.
            </p>
          </div>
        )}
      </aside>

      <div className="fixed inset-x-0 bottom-0 z-10 border-graphite border-t bg-paper-sheet">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-center gap-x-6 gap-y-2 px-5 py-3">
          {mode.kind === "signed" ? (
            <p className="flex items-center gap-2 text-ui" aria-live="polite">
              <Clock size={16} aria-hidden="true" />
              <span>
                <span className="font-semibold">Signed v{view.version}.</span>{" "}
                {mode.status}
              </span>
              {mode.statusHref && (
                <Link
                  href={mode.statusHref}
                  className="text-ink underline underline-offset-4"
                >
                  View
                </Link>
              )}
            </p>
          ) : (
            <>
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
                <div className="flex flex-col items-center gap-1">
                  <Button type="button" disabled>
                    <Fingerprint size={18} aria-hidden="true" />
                    Sign v{view.version} with passkey
                  </Button>
                  <p className="text-muted text-small">
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
            </>
          )}
        </div>
      </div>
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
      className="flex scroll-mt-6 flex-col gap-3 font-serif text-[16.5px] leading-[1.6]"
    >
      <h2
        id={`${id}-h`}
        className="border-rule border-b pb-1.5 font-sans font-semibold text-meta uppercase tracking-[0.12em]"
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
