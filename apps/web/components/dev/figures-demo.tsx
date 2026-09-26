"use client";
import { useState } from "react";
import { Figure, POSE_KEYS, useFrames, useSequence } from "@/components/doodle";
import { ProofWalker } from "@/components/doodle/proof-walker";
import { Button } from "@/components/ui/button";

const RULES = [
  "Delivered total ≤ $1,000",
  "Desk width ≤ 48 in",
  "Monitor 27 in, 4K",
  "USB-C power ≥ 65 W",
];

const WHO = [
  "scout",
  "inspector",
  "notary",
  "guard",
  "gremlin",
  "pair",
] as const;

/** Every pose, plus the frame hooks driven by buttons (T10B.1, T10B.2). */
export function FiguresDemo({ theme }: { theme: "paper" | "blueprint" }) {
  const [running, setRunning] = useState(false);
  const [stamps, setStamps] = useState<number | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [arrived, setArrived] = useState(0);
  const run = useFrames(["run1", "run2", "run3", "run4"], running, {
    still: "idle",
  });
  const stamp = useSequence(["stamp1", "stamp2", "stamp3"], stamps, {
    rest: "idle",
  });
  return (
    <div className="flex flex-col gap-8">
      {WHO.map((who) => (
        <section key={who} aria-label={who} className="flex flex-col gap-3">
          <h3 className="font-sans font-semibold text-meta uppercase tracking-label">
            {who}
          </h3>
          <ul className="flex flex-wrap items-end gap-x-6 gap-y-4">
            {POSE_KEYS[who].map((pose) => (
              <li key={pose} className="flex flex-col items-center gap-1">
                <Figure who={who} pose={pose} h={96} />
                <code className="text-meta text-muted">{pose}</code>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <section aria-label="Proof streaming" className="flex flex-col gap-3">
        <h3 className="font-sans font-semibold text-meta uppercase tracking-label">
          Proof streaming (one result per click)
        </h3>
        <div className="sheet relative max-w-[420px] overflow-hidden">
          <ProofWalker
            requirementId={arrived > 0 ? `rule-${arrived - 1}` : null}
            eventId={arrived > 0 ? String(arrived) : null}
            done={arrived === RULES.length}
          />
          <ol className="flex flex-col">
            {RULES.map((rule, i) => (
              <li
                key={rule}
                data-requirement-id={`rule-${i}`}
                className="border-rule-soft border-b py-3 pr-4 pl-12 text-small"
              >
                {rule}
                <span className="ml-2 font-semibold text-pass">
                  {i < arrived ? "Pass" : ""}
                </span>
              </li>
            ))}
          </ol>
        </div>
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={() => setArrived((n) => Math.min(RULES.length, n + 1))}
          >
            Next result
          </Button>
          <Button variant="ghost" onClick={() => setArrived(0)}>
            Reset
          </Button>
        </div>
        <p aria-live="polite" className="text-muted text-small">
          {arrived > 0 ? `${arrived} of ${RULES.length} checked` : ""}
        </p>
      </section>
      <section aria-label="Sizes" className="flex flex-col gap-3">
        <h3 className="font-sans font-semibold text-meta uppercase tracking-label">
          Sizes (24 · 48 · 64 · 96 · 160)
        </h3>
        <div className="flex items-end gap-4">
          {[24, 48, 64, 96, 160].map((h) => (
            <Figure key={h} who="inspector" h={h} />
          ))}
        </div>
      </section>
      <section aria-label="Motion" className="flex flex-col gap-3">
        <h3 className="font-sans font-semibold text-meta uppercase tracking-label">
          Motion (driven by the buttons, as screens drive it from events)
        </h3>
        <div className="flex flex-wrap items-end gap-8">
          <Figure who="scout" pose={run} h={96} />
          <Figure who="notary" pose={stamp} h={96} />
          <Figure who="guard" pose={blocked ? "block" : "idle"} h={96} />
        </div>
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={() => setRunning((r) => !r)}>
            {running ? "Stop searching" : "Start searching"}
          </Button>
          <Button
            variant="outline"
            onClick={() => setStamps((n) => (n ?? 0) + 1)}
          >
            Stamp
          </Button>
          <Button variant="outline" onClick={() => setBlocked((b) => !b)}>
            {blocked ? "Stand down" : "Block"}
          </Button>
        </div>
        <p aria-live="polite" className="text-muted text-small">
          {theme === "paper" && running ? "Searching…" : ""}
        </p>
      </section>
    </div>
  );
}
