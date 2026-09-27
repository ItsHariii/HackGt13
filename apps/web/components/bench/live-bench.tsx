"use client";
import { Play } from "lucide-react";
import { useState } from "react";
import { runCase } from "@/app/(site)/bench/actions";
import { useBenchProgress } from "@/components/doodle/events";
import { Figure } from "@/components/doodle/figure";
import { StatusMark } from "@/components/paper/status-mark";
import { Button } from "@/components/ui/button";
import type { LiveCase, LiveResult } from "@/lib/bench-live";
import { cn } from "@/lib/utils";

/**
 * Gremlin vs. Guard (SDD §17.9 bench placement): each card is one live
 * attack; the Guard's pose and the counter change only when the engine's
 * answer for that case comes back.
 */
export function LiveBench({ cases }: { cases: LiveCase[] }) {
  const [results, setResults] = useState<Record<string, LiveResult>>({});
  const {
    start,
    running,
    cases: done,
    caught,
  } = useBenchProgress(async function* () {
    setResults({});
    for (const c of cases) {
      const r = await runCase(c.id);
      if (!r) continue;
      setResults((all) => ({ ...all, [c.id]: r }));
      yield { id: c.id, category: c.category, caught: r.caught };
    }
  });
  return (
    <section aria-labelledby="live-title" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="live-title" className="font-semibold font-serif text-h3">
            Live attacks
          </h2>
          <p className="text-muted text-small">
            Each run edits GreatHub's checkout and asks the real engine what to
            do with contract v7.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <p role="status" className="num font-semibold text-ui">
            {done.length === 0 && !running
              ? "Not run yet"
              : `${caught} / ${done.length} caught${running ? "…" : ""}`}
          </p>
          <Button type="button" onClick={() => void start()} disabled={running}>
            <Play size={16} aria-hidden="true" />
            {running ? "Running…" : "Run live"}
          </Button>
        </div>
      </div>
      <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {cases.map((c) => {
          const r = results[c.id];
          return (
            <li
              key={c.id}
              className={cn(
                "sheet flex flex-col gap-3 p-4",
                r && !r.caught && "border-red-pen",
              )}
            >
              <div
                aria-hidden="true"
                className="flex items-end justify-between"
              >
                <Figure who="gremlin" pose={c.pose} h={64} />
                <Figure
                  who="guard"
                  pose={
                    r
                      ? r.caught &&
                        r.classification !== "auto" &&
                        r.classification !== "identical"
                        ? "block"
                        : "idle"
                      : "q"
                  }
                  h={64}
                />
              </div>
              <p className="font-semibold text-meta text-muted uppercase tracking-label">
                {c.category}
              </p>
              <p className="text-ui">{c.attack}</p>
              {r ? (
                <p className="flex flex-col gap-1 text-small">
                  <StatusMark
                    status={r.caught ? "pass" : "fail"}
                    label={
                      r.caught
                        ? c.expect === "stop"
                          ? "Caught"
                          : "Allowed, as it should be"
                        : "Missed"
                    }
                  />
                  <span className="text-muted">{r.outcome}</span>
                </p>
              ) : (
                <p className="text-muted text-small">
                  Expected:{" "}
                  {c.expect === "stop"
                    ? "the guard stops it"
                    : "the purchase may proceed"}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
