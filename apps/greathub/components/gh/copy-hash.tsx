"use client";
import { useEffect, useState } from "react";
import { Copy } from "./icons";

/** A hash pill that copies the full value; shows the short form. */
export function CopyHash({ value, short }: { value: string; short: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(t);
  }, [copied]);
  return (
    <button
      type="button"
      className="gh-hashpill"
      aria-label={`Copy contract hash ${short}`}
      onClick={() => {
        navigator.clipboard
          ?.writeText(value)
          .then(() => setCopied(true))
          .catch(() => {});
      }}
    >
      <span className="gh-code">{short}</span>
      <span className="gh-hashpill-action">
        <Copy size={16} />
        <span aria-live="polite">{copied ? "Copied" : "Copy"}</span>
      </span>
    </button>
  );
}
