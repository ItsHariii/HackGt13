"use client";
import { type ReactNode, useState } from "react";
import { cn } from "@/lib/utils";

const TABS = ["Plan", "Rules", "Proof"] as const;
type TabName = (typeof TABS)[number];

/**
 * Three panes side by side on wide screens; below 1280 px, tabs for
 * Plan · Rules · Proof (Mobile Workspace design, TASKS T10.4).
 */
export function WorkspaceTabs({
  plan,
  rules,
  proof,
}: {
  plan: ReactNode;
  rules: ReactNode;
  proof: ReactNode;
}) {
  const [tab, setTab] = useState<TabName>("Plan");
  const pane = (name: TabName) =>
    cn(
      "min-h-0 xl:flex xl:flex-col",
      tab === name ? "flex flex-col" : "hidden",
    );
  return (
    <>
      <div
        role="tablist"
        aria-label="Workspace sections"
        className="flex rounded-card border border-graphite bg-paper-raised p-1 xl:hidden"
      >
        {TABS.map((name) => (
          <button
            key={name}
            type="button"
            role="tab"
            aria-selected={tab === name}
            onClick={() => setTab(name)}
            className={cn(
              "h-10 flex-1 rounded-[6px] font-semibold text-[15px]",
              tab === name ? "bg-graphite text-paper-raised" : "text-graphite",
            )}
          >
            {name}
          </button>
        ))}
      </div>
      <div className="grid min-h-0 flex-1 gap-5 xl:grid-cols-[300px_minmax(0,1fr)_460px]">
        <div className={cn(pane("Rules"), "order-2 xl:order-1")}>{rules}</div>
        <div className={cn(pane("Plan"), "order-1 xl:order-2")}>{plan}</div>
        <div className={cn(pane("Proof"), "order-3")}>{proof}</div>
      </div>
    </>
  );
}
