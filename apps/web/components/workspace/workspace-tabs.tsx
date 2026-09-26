"use client";
import {
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/utils";

const TABS = ["Plan", "Rules", "Proof"] as const;
type TabName = (typeof TABS)[number];

/** Side pane widths on wide screens: [rules, proof], in px. */
type Widths = [number, number];
const DEFAULT: Widths = [300, 460];
const LIMITS = { rules: [240, 440], proof: [360, 640] } as const;
const PLAN_MIN = 420;
const STORAGE_KEY = "cartel.workspace.panes";

const clamp = (v: number, [lo, hi]: readonly [number, number]) =>
  Math.min(hi, Math.max(lo, v));

function readWidths(): Widths {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    if (Array.isArray(raw) && raw.length === 2)
      return [
        clamp(Number(raw[0]), LIMITS.rules),
        clamp(Number(raw[1]), LIMITS.proof),
      ];
  } catch {}
  return DEFAULT;
}

/**
 * Three resizable panes side by side on wide screens (drag or arrow keys
 * on the dividers; double-click resets); below 1280 px, tabs for
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
  const id = useId();
  const [tab, setTab] = useState<TabName>("Plan");
  const [widths, setWidths] = useState<Widths>(DEFAULT);
  const grid = useRef<HTMLDivElement>(null);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => setWidths(readWidths()), []);
  const save = (w: Widths) => {
    setWidths(w);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(w));
    } catch {}
  };

  /** Keeps the plan pane at least PLAN_MIN wide. */
  const fit = (w: Widths, side: 0 | 1): Widths => {
    const total = grid.current?.clientWidth ?? 1400;
    const room = total - PLAN_MIN - 2 * 20 - w[side === 0 ? 1 : 0];
    const next: Widths = [...w];
    next[side] = Math.min(next[side], room);
    next[0] = clamp(next[0], LIMITS.rules);
    next[1] = clamp(next[1], LIMITS.proof);
    return next;
  };

  const onTabKey = (e: KeyboardEvent) => {
    const i = TABS.indexOf(tab);
    const next =
      e.key === "ArrowRight"
        ? (i + 1) % 3
        : e.key === "ArrowLeft"
          ? (i + 2) % 3
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? 2
              : -1;
    if (next < 0) return;
    e.preventDefault();
    setTab(TABS[next] as TabName);
    tabs.current[next]?.focus();
  };

  const pane = (name: TabName) =>
    cn(
      "min-h-0 xl:flex xl:flex-col",
      tab === name ? "flex flex-col" : "hidden",
    );
  const panel = (name: TabName) => ({
    id: `${id}-${name}`,
    role: "tabpanel" as const,
    "aria-labelledby": `${id}-${name}-tab`,
  });

  return (
    <>
      <div
        role="tablist"
        aria-label="Workspace sections"
        onKeyDown={onTabKey}
        className="flex rounded-card border border-graphite bg-paper-raised p-1 xl:hidden"
      >
        {TABS.map((name, i) => (
          <button
            key={name}
            ref={(el) => {
              tabs.current[i] = el;
            }}
            id={`${id}-${name}-tab`}
            type="button"
            role="tab"
            aria-selected={tab === name}
            aria-controls={`${id}-${name}`}
            tabIndex={tab === name ? 0 : -1}
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
      <div
        ref={grid}
        className="grid min-h-0 flex-1 gap-5 xl:grid-cols-[var(--rules)_minmax(0,1fr)_var(--proof)] xl:gap-0"
        style={
          {
            "--rules": `${widths[0]}px`,
            "--proof": `${widths[1]}px`,
          } as React.CSSProperties
        }
      >
        <div
          {...panel("Rules")}
          className={cn(pane("Rules"), "order-2 xl:order-1 xl:pr-2.5")}
        >
          {rules}
        </div>
        <div
          {...panel("Plan")}
          className={cn(pane("Plan"), "relative order-1 xl:order-2 xl:px-2.5")}
        >
          <Divider
            side={0}
            label="Resize requirements pane"
            controls={`${id}-Rules`}
            value={widths[0]}
            limits={LIMITS.rules}
            onChange={(v) => save(fit([v, widths[1]], 0))}
            onReset={() => save(fit([DEFAULT[0], widths[1]], 0))}
          />
          {plan}
          <Divider
            side={1}
            label="Resize proof pane"
            controls={`${id}-Proof`}
            value={widths[1]}
            limits={LIMITS.proof}
            onChange={(v) => save(fit([widths[0], v], 1))}
            onReset={() => save(fit([widths[0], DEFAULT[1]], 1))}
          />
        </div>
        <div
          {...panel("Proof")}
          className={cn(pane("Proof"), "order-3 xl:pl-2.5")}
        >
          {proof}
        </div>
      </div>
    </>
  );
}

/** A vertical pane divider: drag, arrow keys (Shift = larger steps), Home/End. */
function Divider({
  side,
  label,
  controls,
  value,
  limits,
  onChange,
  onReset,
}: {
  /** 0 = left edge of the plan pane (resizes rules), 1 = right edge (proof). */
  side: 0 | 1;
  label: string;
  controls: string;
  value: number;
  limits: readonly [number, number];
  onChange: (v: number) => void;
  onReset: () => void;
}) {
  const start = useRef<{ x: number; w: number } | null>(null);
  const dir = side === 0 ? 1 : -1;
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    start.current = { x: e.clientX, w: value };
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!start.current) return;
    onChange(
      clamp(start.current.w + dir * (e.clientX - start.current.x), limits),
    );
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 64 : 16;
    const grow = side === 0 ? "ArrowRight" : "ArrowLeft";
    const shrink = side === 0 ? "ArrowLeft" : "ArrowRight";
    const next =
      e.key === grow
        ? value + step
        : e.key === shrink
          ? value - step
          : e.key === "Home"
            ? limits[0]
            : e.key === "End"
              ? limits[1]
              : null;
    if (next === null) return;
    e.preventDefault();
    onChange(clamp(next, limits));
  };
  return (
    // biome-ignore lint/a11y/useSemanticElements: an <hr> can't take focus or pointer drags; this is the ARIA window-splitter pattern
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-controls={controls}
      aria-valuenow={value}
      aria-valuemin={limits[0]}
      aria-valuemax={limits[1]}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={() => {
        start.current = null;
      }}
      onDoubleClick={onReset}
      onKeyDown={onKeyDown}
      className={cn(
        "group absolute top-0 bottom-0 z-10 hidden w-5 cursor-col-resize touch-none xl:block",
        side === 0 ? "-left-2.5" : "-right-2.5",
      )}
    >
      <span
        aria-hidden="true"
        className="absolute top-1/2 left-1/2 h-10 w-1 -translate-x-1/2 -translate-y-1/2 rounded-pill bg-rule group-hover:bg-graphite group-focus-visible:bg-ink"
      />
    </div>
  );
}
