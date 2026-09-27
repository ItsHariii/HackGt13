"use client";
import { Plus } from "lucide-react";
import { useId } from "react";

/**
 * A search filter value with its count and "+ Add as rule". Filters hide
 * products; rules are checked against evidence before you pay.
 */
export function FacetChip({
  label,
  count,
  checked,
  onChange,
  onAddRule,
  ruleText,
}: {
  label: string;
  count: number;
  checked: boolean;
  onChange: (checked: boolean) => void;
  onAddRule?: () => void;
  /** What the rule would say, e.g. "Fiber linen ≥ 90%". */
  ruleText?: string | undefined;
}) {
  const id = useId();
  return (
    <div
      className={
        checked
          ? "-mx-2 flex min-h-9 items-center gap-2.5 rounded-[6px] border border-graphite bg-paper-raised pr-1.5 pl-2 text-[15px]"
          : "flex min-h-9 items-center gap-2.5 text-[15px]"
      }
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-[18px] accent-graphite"
      />
      <label
        htmlFor={id}
        className={`flex flex-1 items-center gap-2 ${checked ? "font-semibold" : ""}`}
      >
        <span className="flex-1">{label}</span>
        <span className="num font-normal text-[13px] text-muted">{count}</span>
      </label>
      {onAddRule && checked && (
        <button
          type="button"
          onClick={onAddRule}
          title={
            ruleText
              ? `Add as rule: ${ruleText} (You chose). Filters hide products. Rules are checked against evidence before you pay.`
              : undefined
          }
          aria-label={`Add as rule${ruleText ? `: ${ruleText}` : ""}`}
          className="inline-flex h-[26px] items-center gap-1 rounded-[5px] border border-ink bg-ink px-2 font-semibold text-[12.5px] text-paper-raised hover:opacity-90"
        >
          <Plus size={12} aria-hidden="true" /> Add as rule
        </button>
      )}
    </div>
  );
}
