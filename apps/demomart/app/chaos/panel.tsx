"use client";
import { Activity, Play, RotateCcw, Send, Timer, Zap } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { RelativeTime } from "@/components/relative-time";
import { usePoll } from "@/components/use-poll";
import type { MutationSpec, Scenario } from "@/lib/chaos";

interface SkuOption {
  sku: string;
  title: string;
  department: string;
}

interface LogEntry {
  id: number;
  mutation: string;
  scenario: string | null;
  target: { sku?: string; params?: Record<string, unknown> };
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  actor: string;
  created_at: string;
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

type Status = { kind: "idle" | "busy" | "ok" | "error"; text: string };

function money(minor: unknown) {
  return typeof minor === "number"
    ? `$${(minor / 100).toFixed(2)}`
    : String(minor);
}

const FIELD_LABELS: Record<string, string> = {
  price_minor: "price",
  seller_id: "seller",
  availability: "availability",
  stock: "stock",
  final_sale: "final sale",
  return_policy_id: "returns",
  pack_size: "pack size",
  shipping_fee_minor: "surcharge",
  ships_sku: "ships as",
  injection_text: "seller note",
  delivery_max_days: "latest delivery (days)",
};

/** A readable one-line diff of what a mutation changed. */
function describe(entry: LogEntry): string[] {
  const b = entry.before ?? {};
  const a = entry.after ?? {};
  const out: string[] = [];
  for (const [key, label] of Object.entries(FIELD_LABELS)) {
    if (JSON.stringify(b[key]) === JSON.stringify(a[key])) continue;
    const fmt = key.endsWith("_minor")
      ? money
      : (v: unknown) => (v === null || v === undefined ? "—" : String(v));
    out.push(`${label} ${fmt(b[key])} → ${fmt(a[key])}`);
  }
  for (const specKey of ["spec", "jsonld_spec"] as const) {
    const before =
      (b[specKey] as { name: string; value: string }[] | null) ?? [];
    const after =
      (a[specKey] as { name: string; value: string }[] | null) ?? [];
    for (const s of after) {
      const prev =
        before.find((x) => x.name === s.name) ??
        (specKey === "jsonld_spec" && !b.jsonld_spec
          ? ((b.spec as { name: string; value: string }[]) ?? []).find(
              (x) => x.name === s.name,
            )
          : undefined);
      if (!prev || prev.value !== s.value) {
        out.push(
          `${specKey === "spec" ? "" : "JSON-LD "}${s.name}: ${prev?.value ?? "—"} → ${s.value}`,
        );
      }
    }
  }
  if (JSON.stringify(b.subscription) !== JSON.stringify(a.subscription))
    out.push("now a subscription");
  if (JSON.stringify(b.recalls) !== JSON.stringify(a.recalls))
    out.push("recall posted (Mock CPSC)");
  return out;
}

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
}: {
  mutations: MutationSpec[];
  scenarios: Scenario[];
  skus: SkuOption[];
}) {
  const formId = useId();
  const [status, setStatus] = useState<Status>({
    kind: "idle",
    text: "Ready.",
  });
  const [mutationId, setMutationId] = useState(mutations[0]?.id ?? "");
  const [sku, setSku] = useState("U2727");
  const [params, setParams] = useState<Record<string, string>>({});
  const [confirmReset, setConfirmReset] = useState(false);
  const { data, error, refresh } = usePoll<{
    entries: LogEntry[];
    webhooks: WebhookRow[];
  }>("/api/chaos/log", 1000);
  const spec = useMemo(
    () => mutations.find((m) => m.id === mutationId),
    [mutations, mutationId],
  );
  const titles = useMemo(
    () => new Map(skus.map((s) => [s.sku, s.title])),
    [skus],
  );

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

  return (
    <div className="chaos">
      <p
        className={`status status-${status.kind}`}
        role="status"
        aria-live="polite"
      >
        {status.text}
      </p>

      <section aria-labelledby="scenarios-title" className="panel">
        <h2 id="scenarios-title">
          <Zap size={16} aria-hidden="true" /> Scenario scripts
        </h2>
        <ul className="scenarios">
          {scenarios.map((s) => (
            <li key={s.id}>
              <div>
                <strong>{s.label}</strong>
                <p>{s.story}</p>
              </div>
              <button
                type="button"
                className="primary-link"
                disabled={status.kind === "busy"}
                onClick={() =>
                  run(s.label, () => post(`/api/chaos/scenarios/${s.id}`))
                }
              >
                <Play size={13} aria-hidden="true" /> Run
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="mutate-title" className="panel">
        <h2 id="mutate-title">
          <Activity size={16} aria-hidden="true" /> Single mutation
        </h2>
        <form
          className="mutate"
          onSubmit={(e) => {
            e.preventDefault();
            run(spec?.label ?? "Mutation", async () => {
              await post("/api/chaos/mutations", {
                mutation: mutationId,
                sku,
                params: buildParams(),
              });
              return `${spec?.label} applied to ${sku}.`;
            });
          }}
        >
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
          <label htmlFor={`${formId}-mutation`}>Mutation</label>
          <select
            id={`${formId}-mutation`}
            value={mutationId}
            onChange={(e) => {
              setMutationId(e.target.value);
              setParams({});
            }}
          >
            {mutations.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
          {spec ? (
            <p className="hint">
              {spec.description} <em>{spec.expect}</em>
            </p>
          ) : null}
          {spec?.params.map((p) => (
            <div key={p.key} className="param">
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
                    p.placeholder ?? (p.kind === "money" ? "e.g. 319.00" : "")
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
            className="primary-link"
            disabled={status.kind === "busy"}
          >
            <Send size={13} aria-hidden="true" /> Apply
          </button>
        </form>
      </section>

      <section aria-labelledby="controls-title" className="panel">
        <h2 id="controls-title">
          <Timer size={16} aria-hidden="true" /> Controls
        </h2>
        <div className="controls">
          {confirmReset ? (
            <>
              <button
                type="button"
                className="danger"
                onClick={() => {
                  setConfirmReset(false);
                  run("Reset", () =>
                    post("/api/chaos/reset").then(
                      () => "Catalog restored to the seed state.",
                    ),
                  );
                }}
              >
                <RotateCcw size={13} aria-hidden="true" /> Confirm reset
              </button>
              <button
                type="button"
                className="ghost"
                onClick={() => setConfirmReset(false)}
              >
                Keep changes
              </button>
            </>
          ) : (
            <button
              type="button"
              className="ghost"
              onClick={() => setConfirmReset(true)}
            >
              <RotateCcw size={13} aria-hidden="true" /> Reset catalog
            </button>
          )}
          <button
            type="button"
            className="ghost"
            onClick={() =>
              run("Mandate tick", async () => {
                const r = await post("/api/chaos/mandate-tick");
                return `ProofCart answered HTTP ${r.status} in ${r.ms} ms.`;
              })
            }
          >
            <Play size={13} aria-hidden="true" /> Run mandate tick now
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() =>
              run("Webhooks", async () => {
                const r = await post("/api/chaos/webhooks", {
                  action: "requeue",
                });
                return `Requeued ${r.requeued}; delivered ${r.delivered} of ${r.attempted}.`;
              })
            }
          >
            <Send size={13} aria-hidden="true" /> Retry webhooks
          </button>
        </div>
      </section>

      <section aria-labelledby="log-title" className="panel span">
        <h2 id="log-title">Mutation log</h2>
        {error ? <p className="form-error">Log not updating: {error}</p> : null}
        <ol className="mutation-log">
          {(data?.entries ?? []).map((e) => (
            <li key={e.id} className={e.mutation === "reset" ? "reset" : ""}>
              <div className="log-head">
                <strong>{e.mutation.replace(/_/g, " ")}</strong>
                {e.target.sku ? (
                  <span className="mono">
                    {e.target.sku}
                    {titles.get(e.target.sku)
                      ? ` · ${titles.get(e.target.sku)}`
                      : ""}
                  </span>
                ) : null}
                {e.scenario ? <span className="tag">{e.scenario}</span> : null}
                <RelativeTime iso={e.created_at} />
              </div>
              <p>
                {e.mutation === "reset"
                  ? "Catalog restored to the seed state."
                  : describe(e).join(" · ") || "No visible change."}
              </p>
            </li>
          ))}
          {data && data.entries.length === 0 ? (
            <li className="empty">No mutations yet.</li>
          ) : null}
        </ol>
      </section>

      <section aria-labelledby="webhooks-title" className="panel span">
        <h2 id="webhooks-title">Order webhooks → ProofCart</h2>
        <div className="table-wrap">
          <table className="log">
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
                  <td className="mono">{w.event_type}</td>
                  <td className="mono">{w.order_id}</td>
                  <td>{w.attempts}</td>
                  <td>
                    {w.delivered_at ? (
                      <span className="verdict ok">Delivered</span>
                    ) : w.failed_at ? (
                      <span className="verdict bad">
                        Parked · {w.last_error}
                      </span>
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
                  <td colSpan={4} className="empty">
                    No orders yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
