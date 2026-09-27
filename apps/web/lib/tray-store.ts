"use client";
import { useSyncExternalStore } from "react";

/*
 * The plan and compare trays (TASKS T11.19), shared by every catalog page
 * in this browser. Stored in localStorage as a per-viewer convenience: a
 * tray is a scratchpad, not a plan. Rules added here are "You chose"
 * requirements waiting to become part of a plan.
 */

export type TrayItem = {
  productId: string;
  title: string;
  role: string;
  price: string;
  priceMinor: number | null;
  tier: "full" | "handoff" | "proof";
  /** Hard rules this product passed / failed against the active plan when added. */
  pass: number;
  fail: number;
};
export type TrayRule = { id: string; text: string; requirement: unknown };
export type CompareEntry = { id: string; name: string; price: string };
export type Trays = {
  items: TrayItem[];
  rules: TrayRule[];
  compare: CompareEntry[];
  recent: CompareEntry[];
};

const KEY = "cartel.trays.v1";
const EMPTY: Trays = { items: [], rules: [], compare: [], recent: [] };
export const COMPARE_MAX = 4;

let state: Trays = EMPTY;
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (raw && typeof raw === "object") state = { ...EMPTY, ...raw };
  } catch {}
}

function set(next: Trays) {
  state = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {}
  for (const l of listeners) l();
}

export function useTrays(): Trays {
  return useSyncExternalStore(
    (l) => {
      load();
      listeners.add(l);
      const onStorage = (e: StorageEvent) => {
        if (e.key !== KEY) return;
        loaded = false;
        load();
        l();
      };
      window.addEventListener("storage", onStorage);
      return () => {
        listeners.delete(l);
        window.removeEventListener("storage", onStorage);
      };
    },
    () => {
      load();
      return state;
    },
    () => EMPTY,
  );
}

export const trays = {
  addItem(item: TrayItem) {
    load();
    set({
      ...state,
      items: [...state.items.filter((i) => i.role !== item.role), item],
    });
  },
  removeItem(productId: string) {
    set({
      ...state,
      items: state.items.filter((i) => i.productId !== productId),
    });
  },
  addRule(rule: TrayRule) {
    load();
    if (state.rules.some((r) => r.text === rule.text)) return false;
    set({ ...state, rules: [...state.rules, rule] });
    return true;
  },
  removeRule(id: string) {
    set({ ...state, rules: state.rules.filter((r) => r.id !== id) });
  },
  toggleCompare(entry: CompareEntry, on: boolean) {
    load();
    const rest = state.compare.filter((c) => c.id !== entry.id);
    if (on && rest.length >= COMPARE_MAX) return false;
    set({ ...state, compare: on ? [...rest, entry] : rest });
    return true;
  },
  viewed(entry: CompareEntry) {
    load();
    set({
      ...state,
      recent: [entry, ...state.recent.filter((r) => r.id !== entry.id)].slice(
        0,
        8,
      ),
    });
  },
  clear() {
    set({ ...EMPTY, recent: state.recent });
  },
};

/** "$870.37" for the items in the tray that have a price. */
export function trayTotal(items: TrayItem[]): string | undefined {
  const priced = items.filter((i) => i.priceMinor !== null);
  if (priced.length === 0) return undefined;
  const cents = priced.reduce((n, i) => n + (i.priceMinor ?? 0), 0);
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
