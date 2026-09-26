"use client";
import { useEffect, useRef } from "react";

/**
 * The refinement bar (TASKS T11.3). ⌘K / Ctrl+K focuses it. Sending a
 * refinement needs the A4 patch → confirm → re-solve flow, which isn't
 * wired into the web app yet, so submitting is disabled and says so.
 */
export function CommandBar() {
  const input = useRef<HTMLInputElement>(null);
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
  return (
    <form
      aria-label="Refine this plan"
      onSubmit={(e) => e.preventDefault()}
      className="flex h-14 items-center gap-3 rounded-[10px] border border-graphite bg-paper-raised pr-2 pl-[18px] shadow-offset"
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        aria-hidden="true"
        className="shrink-0"
      >
        <path d="M3 5.5h14M3 10h9M3 14.5h6" />
      </svg>
      <label htmlFor="command-bar" className="sr-only">
        Ask Cartel to refine this plan
      </label>
      <input
        ref={input}
        id="command-bar"
        type="text"
        aria-describedby="command-bar-hint"
        placeholder="Ask Cartel… e.g. 'Make it $100 cheaper without changing the monitor'"
        className="min-w-0 flex-1 bg-transparent text-[16px] text-graphite outline-none placeholder:text-muted"
      />
      <span id="command-bar-hint" className="sr-only">
        Refinements arrive with the AI layer. Nothing you type here is sent yet.
      </span>
      <kbd className="hidden rounded-[5px] border border-rule px-1.5 py-0.5 font-mono text-meta text-muted sm:inline">
        ⌘K
      </kbd>
      <button
        type="submit"
        disabled
        aria-label="Send (not available yet)"
        title="Refinements arrive with the AI layer"
        className="flex size-10 items-center justify-center rounded-card bg-graphite text-paper-raised disabled:opacity-50"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M8 13V3M3.5 7.5L8 3l4.5 4.5" />
        </svg>
      </button>
    </form>
  );
}
