"use client";
import { useId, useMemo, useState } from "react";
import { GHFigure } from "@/components/gh/figure";
import { Bell, Knot, Play, Undo } from "@/components/gh/icons";
import { usePoll } from "@/components/use-poll";
import {
  ago,
  type CatchEntry,
  catchAuthor,
  catchHash,
  catchMessage,
} from "@/lib/catches";
import type { MutationSpec } from "@/lib/chaos";

interface SkuOption {
  sku: string;
  title: string;
  department: string;
}

interface WebhookRow {
  event_id: string;
  event_type: string;
  order_id: string;
  attempts: number;
  delivered_at: string | null;
  failed_at: string | null;
  last_error: string | null;
  created_at: string;
}

export interface ScenarioView {
  id: string;
  label: string;
  story: string;
  subject: string;
  ids: string;
  lines: { label: string; from: string; to: string }[];
}

type Status = { kind: "idle" | "busy" | "ok" | "error"; text: string };

/* "Stir the waters": the design's harbor labels over the real mutation
   ids. Every mutation in lib/chaos.ts has a button. */
const GROUPS: { name: string; items: [id: string, label: string][] }[] = [
  {
    name: "PRICE",
    items: [
      ["price_drop", "Force-ship price drop"],
      ["price_raise", "Price hike"],
      ["shipping_fee_added", "Add shipping fee"],
    ],
  },
  {
    name: "SPECS",
    items: [
      ["spec_edit", "Scribble on spec (same SKU)"],
      ["variant_swap", "Swap variant"],
      ["jsonld_conflict", "Mismatch the listing data"],
      ["pack_size_shrink", "Shrink the pack"],
    ],
  },
  {
    name: "TERMS",
    items: [
      ["final_sale_flip", "Flip to final sale"],
      ["return_fee_added", "Add return fee"],
      ["return_window_shortened", "Shorten return window"],
      ["subscription_added", "Sneak in a subscription"],
    ],
  },
  {
    name: "DELIVERY",
    items: [
      ["delivery_slip", "Delay delivery"],
      ["out_of_stock", "Mark out of stock"],
    ],
  },
  {
    name: "CREW AND SECURITY",
    items: [
      ["seller_rotation", "Rotate the seller"],
      ["listing_injection_text", "Plant a message in the listing"],
      ["recall_posted", "Post a recall (Mock CPSC)"],
    ],
  },
];

async function post(url: string, body?: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const detail =
      typeof json.detail === "string" && json.detail ? ` (${json.detail})` : "";
    throw new Error(
      `${String(json.message ?? json.error ?? `HTTP ${res.status}`)}${detail}`,
    );
  }
  return json;
}

export function ChaosPanel({
  mutations,
  scenarios,
  skus,
  gullTag,
  signOut,
}: {
  mutations: MutationSpec[];
  scenarios: ScenarioView[];
  skus: SkuOption[];
  /** The Vireo U2727's real current price, for the Gull's tag. */
  gullTag: string;
  signOut: () => Promise<void>;
}) {
  const formId = useId();
  const [status, setStatus] = useState<Status>({
    kind: "idle",
    text: "Ready.",
  });
  const [mutationId, setMutationId] = useState<string | null>(null);
  const [sku, setSku] = useState("U2727");
  const [params, setParams] = useState<Record<string, string>>({});
  const [confirmReset, setConfirmReset] = useState(false);
  const [bell, setBell] = useState<string | null>(null);
  const { data, error, refresh } = usePoll<{
    entries: CatchEntry[];
    webhooks: WebhookRow[];
  }>("/api/chaos/log", 1000);
  const spec = useMemo(
    () => mutations.find((m) => m.id === mutationId),
    [mutations, mutationId],
  );
  const busy = status.kind === "busy";
  const entries = data?.entries ?? [];

  async function run(label: string, fn: () => Promise<unknown>) {
    setStatus({ kind: "busy", text: `${label}…` });
    try {
      const result = await fn();
      setStatus({
        kind: "ok",
        text: typeof result === "string" ? result : `${label}: done.`,
      });
      refresh();
    } catch (e) {
      setStatus({ kind: "error", text: `${label}: ${(e as Error).message}` });
    }
  }

  function buildParams(): Record<string, string | number> {
    const out: Record<string, string | number> = {};
    for (const p of spec?.params ?? []) {
      const raw = (params[p.key] ?? "").trim();
      if (!raw) {
        if (p.required) throw new Error(`${p.label} is required`);
        continue;
      }
      if (p.kind === "money") {
        const n = Number(raw.replace(/[$,]/g, ""));
        if (!Number.isFinite(n) || n < 0)
          throw new Error(`${p.label} must be an amount`);
        out[p.key] = Math.round(n * 100);
      } else if (p.kind === "integer") {
        const n = Number(raw);
        if (!Number.isInteger(n))
          throw new Error(`${p.label} must be a whole number`);
        out[p.key] = n;
      } else {
        out[p.key] = raw;
      }
    }
    return out;
  }

  const [flagship, ...others] = scenarios;
  const labelOf = (id: string) =>
    GROUPS.flatMap((g) => g.items).find(([m]) => m === id)?.[1] ??
    spec?.label ??
    id;

  return (
    <>
      <div className="gh-deck-head">
        <div>
          <p className="gh-code gh-muted gh-deck-path">
            greathub / admin / chaos
          </p>
          <h1 className="gh-title">The Chaos Deck</h1>
        </div>
        <div className="gh-deck-actions">
          <button
            type="button"
            className="gh-bigbtn"
            disabled={busy}
            onClick={() =>
              run("Ship's bell", async () => {
                const r = await post("/api/chaos/mandate-tick");
                const at = new Date().toLocaleTimeString("en-US", {
                  hour12: false,
                });
                setBell(at);
                return `Mandate tick sent at ${at}: Cartel answered HTTP ${r.status} in ${r.ms} ms.`;
              })
            }
          >
            <Bell size={32} />
            <span>
              <strong>Ring the ship&apos;s bell</strong>
              <span>
                {bell ? `Mandate tick sent · ${bell}` : "Run mandate tick now"}
              </span>
            </span>
          </button>
          {confirmReset ? (
            <div className="gh-confirm">
              <button
                type="button"
                className="gh-bigbtn danger"
                onClick={() => {
                  setConfirmReset(false);
                  run("Reset", () =>
                    post("/api/chaos/reset").then(
                      () => "Low tide: the catalog is back to its seed state.",
                    ),
                  );
                }}
              >
                <Undo size={30} />
                <span>
                  <strong>Confirm low tide</strong>
                  <span>Every catch is undone</span>
                </span>
              </button>
              <button
                type="button"
                className="gh-btn gh-btn-ghost"
                onClick={() => setConfirmReset(false)}
              >
                Keep the changes
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="gh-bigbtn danger"
              disabled={busy}
              onClick={() => setConfirmReset(true)}
            >
              <Undo size={30} />
              <span>
                <strong>Reset to low tide</strong>
                <span>Restore seed data</span>
              </span>
            </button>
          )}
          <form action={signOut}>
            <button type="submit" className="gh-btn gh-btn-ghost">
              Leave the quarters
            </button>
          </form>
        </div>
      </div>

      <p
        className={`gh-status gh-status-${status.kind}`}
        role="status"
        aria-live="polite"
      >
        {status.text}
      </p>

      <div className="gh-deck-grid">
        <section aria-labelledby={`${formId}-stir`} className="gh-stir">
          <h2 id={`${formId}-stir`} className="gh-h2">
            Stir the waters
          </h2>
          {GROUPS.map((g) => (
            <div key={g.name} className="gh-stir-group">
              <div className="gh-rope-label">
                <span>{g.name}</span>
                <span className="gh-rope" aria-hidden="true" />
                <Knot size={18} />
              </div>
              <div className="gh-stir-grid">
                {g.items
                  .filter(([id]) => mutations.some((m) => m.id === id))
                  .map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      className="gh-stir-btn"
                      aria-pressed={mutationId === id}
                      aria-controls={`${formId}-form`}
                      onClick={() => {
                        setMutationId(mutationId === id ? null : id);
                        setParams({});
                      }}
                    >
                      <span>{label}</span>
                      <span className="gh-code">{id}</span>
                    </button>
                  ))}
              </div>
            </div>
          ))}
          {spec ? (
            <form
              id={`${formId}-form`}
              className="gh-card gh-stir-form"
              onSubmit={(e) => {
                e.preventDefault();
                run(labelOf(spec.id), async () => {
                  await post("/api/chaos/mutations", {
                    mutation: spec.id,
                    sku,
                    params: buildParams(),
                  });
                  return `${labelOf(spec.id)} applied to ${sku}.`;
                });
              }}
            >
              <p className="gh-stir-form-title">
                <strong>{labelOf(spec.id)}</strong>{" "}
                <span className="gh-code gh-muted">{spec.id}</span>
              </p>
              <p className="gh-fine">
                {spec.description} <em>{spec.expect}</em>
              </p>
              <label htmlFor={`${formId}-sku`}>Item</label>
              <select
                id={`${formId}-sku`}
                value={sku}
                onChange={(e) => setSku(e.target.value)}
              >
                {["home_office", "apparel", "travel"].map((d) => (
                  <optgroup key={d} label={d.replace("_", " ")}>
                    {skus
                      .filter((s) => s.department === d)
                      .map((s) => (
                        <option key={s.sku} value={s.sku}>
                          {s.sku} · {s.title}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </select>
              {spec.params.map((p) => (
                <div key={p.key} className="gh-field">
                  <label htmlFor={`${formId}-${p.key}`}>{p.label}</label>
                  {p.kind === "sku" ? (
                    <select
                      id={`${formId}-${p.key}`}
                      value={params[p.key] ?? ""}
                      required={p.required}
                      onChange={(e) =>
                        setParams({ ...params, [p.key]: e.target.value })
                      }
                    >
                      <option value="">Choose…</option>
                      {skus
                        .filter((s) => s.sku !== sku)
                        .map((s) => (
                          <option key={s.sku} value={s.sku}>
                            {s.sku} · {s.title}
                          </option>
                        ))}
                    </select>
                  ) : (
                    <input
                      id={`${formId}-${p.key}`}
                      inputMode={
                        p.kind === "money"
                          ? "decimal"
                          : p.kind === "integer"
                            ? "numeric"
                            : "text"
                      }
                      placeholder={
                        p.placeholder ??
                        (p.kind === "money" ? "e.g. 319.00" : "")
                      }
                      required={p.required}
                      value={params[p.key] ?? ""}
                      onChange={(e) =>
                        setParams({ ...params, [p.key]: e.target.value })
                      }
                    />
                  )}
                </div>
              ))}
              <button
                type="submit"
                className="gh-btn gh-btn-navy"
                disabled={busy}
              >
                <Play size={14} /> Stir it
              </button>
            </form>
          ) : (
            <p className="gh-fine">
              Pick a mutation to choose the item and its values.
            </p>
          )}
        </section>

        <section aria-labelledby={`${formId}-scripts`} className="gh-scripts">
          <h2 id={`${formId}-scripts`} className="gh-h2">
            Scenario scripts
          </h2>
          {flagship ? (
            <div className="gh-rope-card gh-flagship">
              <div className="gh-rope-card-inner">
                <div className="gh-flagship-head">
                  <span className="gh-overline danger">
                    SCENARIO 1 · FLAGSHIP
                  </span>
                  <h3>{flagship.label}</h3>
                  <span className="gh-flagship-subject">
                    {flagship.subject}
                  </span>
                </div>
                <dl className="gh-flagship-lines">
                  {flagship.lines.map((l) => (
                    <div key={l.label}>
                      <dt>{l.label}</dt>
                      <dd className="gh-code">
                        {l.from} → {l.to}
                      </dd>
                    </div>
                  ))}
                </dl>
                <div className="gh-flagship-run">
                  <button
                    type="button"
                    className="gh-btn gh-btn-navy gh-btn-lg"
                    disabled={busy}
                    onClick={() =>
                      run(flagship.label, () =>
                        post(`/api/chaos/scenarios/${flagship.id}`),
                      )
                    }
                  >
                    <Play size={20} /> Run scenario
                  </button>
                  <span className="gh-code gh-muted">{flagship.ids}</span>
                </div>
              </div>
              <GHFigure
                pose="gtag"
                flip
                tag={gullTag}
                className="gh-flagship-gull"
              />
            </div>
          ) : null}
          <div className="gh-scenario-grid">
            {others.map((s, i) => (
              <div key={s.id} className="gh-card gh-scenario">
                <span className="gh-overline">SCENARIO {i + 2}</span>
                <h3>{s.label}</h3>
                <span className="gh-scenario-subject">{s.subject}</span>
                {s.lines.map((l) => (
                  <span key={l.label} className="gh-code gh-scenario-line">
                    {l.from} → {l.to}
                  </span>
                ))}
                <p className="gh-fine">{s.story}</p>
                <button
                  type="button"
                  className="gh-btn gh-btn-outline"
                  disabled={busy}
                  onClick={() =>
                    run(s.label, () => post(`/api/chaos/scenarios/${s.id}`))
                  }
                >
                  <Play size={14} /> Run
                </button>
              </div>
            ))}
          </div>
        </section>

        <section
          aria-labelledby={`${formId}-history`}
          aria-live="polite"
          className="gh-history"
        >
          <div className="gh-history-head">
            <h2 id={`${formId}-history`} className="gh-h2">
              Catch history
            </h2>
            <span>
              {entries.length} catch{entries.length === 1 ? "" : "es"}
            </span>
          </div>
          {error ? (
            <p className="gh-form-error">Log not updating: {error}</p>
          ) : null}
          <div className="gh-history-box">
            {entries.length > 0 ? (
              <ol className="gh-catches">
                {entries.map((e, i) => (
                  <li key={e.id} className={i === 0 ? "latest" : undefined}>
                    <p className="gh-code">{catchMessage(e)}</p>
                    <div className="gh-catch-meta">
                      <span
                        className={`gh-avatar ${catchAuthor(e) === "the-gull" ? "gull" : ""}`}
                        aria-hidden="true"
                      />
                      <strong>{catchAuthor(e)}</strong>
                      <span>caught {ago(e.created_at)}</span>
                      {i === 0 ? (
                        <span className="gh-latest">LATEST</span>
                      ) : null}
                      {e.scenario ? (
                        <span className="gh-code gh-muted">{e.scenario}</span>
                      ) : null}
                      <span className="gh-code gh-hash">{catchHash(e.id)}</span>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="gh-calm">
                <GHFigure pose="nap" className="gh-calm-figure" />
                <p>
                  {data
                    ? "Calm seas. Nothing's been tampered with."
                    : "Checking the log…"}
                </p>
              </div>
            )}
          </div>
        </section>
      </div>

      <section
        aria-labelledby={`${formId}-webhooks`}
        className="gh-card gh-webhooks"
      >
        <div className="gh-webhooks-head">
          <h2 id={`${formId}-webhooks`} className="gh-h3">
            Order webhooks → Cartel
          </h2>
          <button
            type="button"
            className="gh-btn gh-btn-ghost"
            disabled={busy}
            onClick={() =>
              run("Webhooks", async () => {
                const r = await post("/api/chaos/webhooks", {
                  action: "requeue",
                });
                return `Requeued ${r.requeued}; delivered ${r.delivered} of ${r.attempted}.`;
              })
            }
          >
            Retry webhooks
          </button>
        </div>
        <div className="gh-table-wrap">
          <table className="gh-table">
            <thead>
              <tr>
                <th scope="col">Event</th>
                <th scope="col">Order</th>
                <th scope="col">Attempts</th>
                <th scope="col">State</th>
              </tr>
            </thead>
            <tbody>
              {(data?.webhooks ?? []).map((w) => (
                <tr key={w.event_id}>
                  <td className="gh-code">{w.event_type}</td>
                  <td className="gh-code">{w.order_id}</td>
                  <td>{w.attempts}</td>
                  <td>
                    {w.delivered_at ? (
                      <span className="gh-ok">Delivered</span>
                    ) : w.failed_at ? (
                      <span className="gh-bad">Parked · {w.last_error}</span>
                    ) : (
                      <span>
                        Retrying{w.last_error ? ` · ${w.last_error}` : ""}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {data && data.webhooks.length === 0 ? (
                <tr>
                  <td colSpan={4} className="gh-empty-row">
                    No cargo yet, so nothing to tell Cartel.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
