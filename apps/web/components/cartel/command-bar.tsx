"use client";
import { ArrowUp, Search } from "lucide-react";
import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * The ⌘K bar (Style Tile v2): "Describe what you need, or search
 * products…". ⌘K / Ctrl+K focuses it from anywhere on the page. Without
 * `onSubmit` the send button is disabled and `disabledReason` says why.
 */
export function CommandBar({
  label,
  placeholder = "Describe what you need, or search products…",
  onSubmit,
  disabledReason,
  size = "lg",
  className,
}: {
  /** Accessible name of the input. */
  label: string;
  placeholder?: string | undefined;
  onSubmit?: (text: string) => void;
  disabledReason?: string | undefined;
  size?: "md" | "lg";
  className?: string | undefined;
}) {
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  const [text, setText] = useState("");
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const value = text.trim();
    if (value && onSubmit) onSubmit(value);
  };
  return (
    <form
      aria-label={label}
      onSubmit={submit}
      className={cn(
        "flex items-center gap-3 rounded-[10px] border border-graphite bg-paper-raised pr-2 pl-4 shadow-offset",
        size === "lg" ? "h-14" : "h-11",
        className,
      )}
    >
      <Search size={18} aria-hidden="true" className="shrink-0 text-muted" />
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input
        ref={input}
        id={id}
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        aria-describedby={disabledReason ? `${id}-hint` : undefined}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent text-[16px] text-graphite outline-none placeholder:text-muted"
      />
      {disabledReason && (
        <span id={`${id}-hint`} className="sr-only">
          {disabledReason}
        </span>
      )}
      <kbd className="hidden rounded-[5px] border border-rule px-1.5 py-0.5 font-mono text-meta text-muted sm:inline">
        ⌘K
      </kbd>
      <button
        type="submit"
        disabled={!onSubmit}
        aria-label={onSubmit ? "Send" : "Send (not available yet)"}
        title={disabledReason}
        className={cn(
          "flex shrink-0 items-center justify-center rounded-card bg-graphite text-paper-raised disabled:opacity-50",
          size === "lg" ? "size-10" : "size-8",
        )}
      >
        <ArrowUp size={15} strokeWidth={2.4} aria-hidden="true" />
      </button>
    </form>
  );
}
