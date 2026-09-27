"use client";
import { Buoy, Check, Cross, Lighthouse } from "@/components/gh/icons";
import { usePoll } from "@/components/use-poll";

interface Entry {
  id: number;
  request_id: string | null;
  method: string;
  path: string;
  key_id: string | null;
  tag: string | null;
  verdict: "accepted" | "rejected";
  reason: string | null;
  created_at: string;
}

/** Cartel's agent keys carry the `ct-agent-` prefix (key-role binding). */
function agentName(keyId: string | null): string {
  if (!keyId) return "unknown";
  return keyId.startsWith("ct-agent-")
    ? "Cartel"
    : (keyId.split("-")[0] ?? "unknown");
}

function clock(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { hour12: false });
}

export function AgentLog() {
  const { data, error } = usePoll<{ entries: Entry[] }>(
    "/api/agents/log",
    1000,
  );
  const entries = data?.entries ?? [];
  const accepted = entries.filter((e) => e.verdict === "accepted");
  const latestVerified = accepted[0];
  const newest = entries[0];
  return (
    <>
      <div className="gh-harbor-head">
        <div className="gh-harbor-title">
          <p className="gh-code gh-muted">greathub / admin / agents</p>
          <h1 className="gh-title">
            Harbor Master&apos;s Log: who&apos;s at the dock
          </h1>
          <p className="gh-live" aria-live="polite">
            {error ? (
              <span>Not updating: {error}</span>
            ) : (
              <>
                <Buoy />
                <strong>Live</strong>
                <span className="gh-muted-2">
                  ·{" "}
                  {newest
                    ? `updated ${clock(newest.created_at)}`
                    : "waiting for the first request"}{" "}
                  · signed requests only
                </span>
              </>
            )}
          </p>
        </div>
        {latestVerified ? (
          <div className="gh-verified">
            <span className="gh-verified-mark">
              <Check size={36} />
            </span>
            <span>
              <strong>
                ✓ Verified agent {agentName(latestVerified.key_id)}
              </strong>
              <span className="gh-code">key ID {latestVerified.key_id}</span>
            </span>
          </div>
        ) : null}
      </div>

      <div className="gh-log-card">
        <div className="gh-table-wrap">
          <table className="gh-log">
            <caption className="sr-only">
              Signed agent requests, newest first
            </caption>
            <thead>
              <tr>
                <th scope="col">time</th>
                <th scope="col">agent</th>
                <th scope="col">key ID</th>
                <th scope="col">tag</th>
                <th scope="col">path</th>
                <th scope="col">result</th>
                <th scope="col">
                  reason
                  <span className="gh-beam" aria-hidden="true" />
                  <Lighthouse />
                </th>
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 ? (
                <tr>
                  <td colSpan={7} className="gh-empty-row">
                    {data
                      ? "Nobody at the dock yet. No agent requests."
                      : "Loading…"}
                  </td>
                </tr>
              ) : (
                entries.map((e) => {
                  const ok = e.verdict === "accepted";
                  return (
                    <tr key={e.id} className={ok ? undefined : "rejected"}>
                      <td className="gh-code">
                        <time dateTime={e.created_at}>
                          {clock(e.created_at)}
                        </time>
                      </td>
                      <td>
                        <strong>{agentName(e.key_id)}</strong>
                      </td>
                      <td className="gh-code">{e.key_id ?? "—"}</td>
                      <td className="gh-code">{e.tag ?? "—"}</td>
                      <td className="gh-code gh-path">
                        {e.method} {e.path}
                      </td>
                      <td>
                        <span className={ok ? "gh-result ok" : "gh-result bad"}>
                          <span className="gh-result-mark">
                            {ok ? <Check size={18} /> : <Cross size={16} />}
                          </span>
                          {ok ? "Verified (RFC 9421)" : "Rejected"}
                        </span>
                      </td>
                      <td>{e.reason ?? "—"}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="gh-log-foot">
          <span>
            <strong>{accepted.length}</strong> verified
          </span>
          <span>
            <strong>{entries.length - accepted.length}</strong> rejected
          </span>
          <span className="gh-code gh-log-foot-note">
            Ed25519 signatures checked per RFC 9421 · valid for at most 8 min ·
            nonces used once
          </span>
        </div>
      </div>
    </>
  );
}
