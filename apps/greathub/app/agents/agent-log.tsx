"use client";
import { CircleCheck, CircleX } from "lucide-react";
import { RelativeTime } from "@/components/relative-time";
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

export function AgentLog() {
  const { data, error } = usePoll<{ entries: Entry[] }>(
    "/api/agents/log",
    1000,
  );
  const entries = data?.entries ?? [];
  const accepted = entries.filter((e) => e.verdict === "accepted").length;
  return (
    <>
      <p className="live" aria-live="polite">
        <span className={error ? "dot off" : "dot"} aria-hidden="true" />
        {error
          ? `Not updating: ${error}`
          : `Live · ${accepted} accepted, ${entries.length - accepted} rejected in the last ${entries.length}`}
      </p>
      <div className="table-wrap">
        <table className="log">
          <thead>
            <tr>
              <th scope="col">Verdict</th>
              <th scope="col">When</th>
              <th scope="col">Request</th>
              <th scope="col">Key ID</th>
              <th scope="col">Tag</th>
              <th scope="col">Reason</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr>
                <td colSpan={6} className="empty">
                  {data ? "No agent requests yet." : "Loading…"}
                </td>
              </tr>
            ) : (
              entries.map((e) => (
                <tr key={e.id} className={e.verdict}>
                  <td>
                    {e.verdict === "accepted" ? (
                      <span className="verdict ok">
                        <CircleCheck size={15} aria-hidden="true" /> Accepted
                      </span>
                    ) : (
                      <span className="verdict bad">
                        <CircleX size={15} aria-hidden="true" /> Rejected
                      </span>
                    )}
                  </td>
                  <td>
                    <RelativeTime iso={e.created_at} />
                  </td>
                  <td className="mono">
                    {e.method} {e.path}
                  </td>
                  <td className="mono">{e.key_id ?? "—"}</td>
                  <td className="mono">{e.tag ?? "—"}</td>
                  <td className="mono">{e.reason ?? ""}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
