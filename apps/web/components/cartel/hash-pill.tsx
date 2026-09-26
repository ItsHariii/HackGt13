"use client";
import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

/** "sha256:7c1e…a94f" from a full hex digest, with or without the prefix. */
export function abbreviateHash(hash: string, keep = 4): string {
  const [algo, hex] = hash.includes(":")
    ? (hash.split(":", 2) as [string, string])
    : ["sha256", hash];
  if (hex.length <= keep * 2 + 1) return `${algo}:${hex}`;
  return `${algo}:${hex.slice(0, keep)}…${hex.slice(-keep)}`;
}

/** An abbreviated hash with a copy button; the full value is copied. */
export function HashPill({
  hash,
  className,
}: {
  hash: string;
  className?: string | undefined;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(hash);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };
  return (
    <span
      className={cn(
        "inline-flex h-7 items-center gap-1 rounded-pill border border-rule bg-paper-raised pr-1 pl-2.5 text-graphite",
        className,
      )}
    >
      <code title={hash} className="num text-[12.5px]">
        {abbreviateHash(hash)}
      </code>
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? "Hash copied" : "Copy full hash"}
        className="inline-flex size-6 items-center justify-center rounded-pill text-muted hover:bg-paper hover:text-graphite"
      >
        {copied ? (
          <Check
            size={13}
            strokeWidth={2.6}
            aria-hidden="true"
            className="text-green-check"
          />
        ) : (
          <Copy size={13} aria-hidden="true" />
        )}
      </button>
      <span aria-live="polite" className="sr-only">
        {copied ? "Copied" : ""}
      </span>
    </span>
  );
}
