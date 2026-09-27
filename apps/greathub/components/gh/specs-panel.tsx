"use client";
import { useId, useState } from "react";
import { GullFootprint } from "./icons";

export interface SpecRow {
  name: string;
  value: string;
  /** Differs from the seeded listing: someone has been at it. */
  changed: boolean;
}

/** The product's specs, rendered or raw (GreatHub Product design). */
export function SpecsPanel({ rows }: { rows: SpecRow[] }) {
  const [raw, setRaw] = useState(false);
  const id = useId();
  return (
    <section aria-labelledby={`${id}-title`} className="gh-card gh-specs">
      <div className="gh-specs-bar">
        <h2 id={`${id}-title`} className="gh-code gh-specs-title">
          specs
        </h2>
        <span className="gh-code gh-muted">
          · {rows.length} line{rows.length === 1 ? "" : "s"}
        </span>
        <div role="tablist" aria-label="View" className="gh-seg">
          <button
            type="button"
            role="tab"
            aria-selected={raw}
            aria-controls={`${id}-panel`}
            onClick={() => setRaw(true)}
          >
            Raw
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={!raw}
            aria-controls={`${id}-panel`}
            onClick={() => setRaw(false)}
          >
            Rendered
          </button>
        </div>
      </div>
      <div id={`${id}-panel`} role="tabpanel">
        {raw ? (
          <ol className="gh-code gh-specs-raw">
            {rows.map((r) => (
              <li key={r.name}>
                {r.name}: {r.value}
                {r.changed ? " # changed since seed" : ""}
              </li>
            ))}
          </ol>
        ) : (
          <table className="gh-specs-table">
            <tbody>
              {rows.map((r) => (
                <tr key={r.name}>
                  <th scope="row">{r.name}</th>
                  <td>
                    <span className="gh-spec-value">
                      {r.value}
                      {r.changed ? (
                        <span className="gh-footprint">
                          <GullFootprint size={14} />
                          <span className="sr-only">
                            Changed since the listing was seeded
                          </span>
                        </span>
                      ) : null}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
