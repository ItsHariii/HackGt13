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
    <div className="flex min-h-8 items-center gap-2 text-small">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 accent-ink"
      />
      <label htmlFor={id} className="flex flex-1 items-center gap-2">
        {label}
        <span className="num text-meta text-muted">{count}</span>
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
          className="inline-flex min-h-6 items-center gap-1 rounded-[5px] border border-ink px-1.5 font-semibold text-ink text-meta hover:bg-ink/10"
        >
          <Plus size={12} aria-hidden="true" /> Add as rule
        </button>
      )}
    </div>
  );
}
