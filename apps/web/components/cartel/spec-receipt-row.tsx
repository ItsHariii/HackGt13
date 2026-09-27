import { Plus } from "lucide-react";
import type { ReactNode } from "react";
import { EvidenceBadge, type EvidenceLevel } from "./evidence-badge";

export type SpecReceipt = {
  spec: string;
  value: string;
  evidence: EvidenceLevel;
  source: string;
  checked: string;
};

/** The "Specs with receipts" table: who says so, and when (Product design). */
export function SpecReceiptTable({
  caption,
  children,
}: {
  caption: string;
  children: ReactNode;
}) {
  return (
    // Six columns don't fit a phone; the table scrolls inside its own box, never the page.
    <div
      // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrolling table must be reachable by keyboard (WCAG 2.1.1)
      tabIndex={0}
      className="relative max-w-full overflow-x-auto"
    >
      <table className="w-full min-w-[760px] border-separate border-spacing-0 overflow-hidden rounded-card border border-rule bg-paper-raised text-left text-[14px]">
        <caption className="sr-only">{caption}</caption>
        <thead className="text-[12px] text-muted uppercase tracking-[0.08em]">
          <tr className="bg-[#f6f1e4] dark:bg-paper-shade [&>th]:border-rule [&>th]:border-b [&>th]:px-6 [&>th]:py-3">
            <th scope="col" className="px-3 py-2 font-semibold">
              Spec
            </th>
            <th scope="col" className="px-3 py-2 font-semibold">
              Value
            </th>
            <th scope="col" className="px-3 py-2 font-semibold">
              Evidence
            </th>
            <th scope="col" className="px-3 py-2 font-semibold">
              Source
            </th>
            <th scope="col" className="px-3 py-2 font-semibold">
              Checked
            </th>
            <th scope="col" className="px-3 py-2">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function SpecReceiptRow({
  receipt,
  onMakeRule,
}: {
  receipt: SpecReceipt;
  /** Shown as "+ Make this a rule". */
  onMakeRule?: (() => void) | undefined;
}) {
  return (
    <tr className="group text-graphite hover:bg-paper-sheet [&:not(:last-child)>*]:border-rule-soft [&:not(:last-child)>*]:border-b [&>*]:px-6 [&>*]:py-4">
      <th scope="row" className="font-medium text-[15px]">
        {receipt.spec}
      </th>
      <td className="num text-[16px] text-ink">{receipt.value}</td>
      <td>
        <EvidenceBadge level={receipt.evidence} />
      </td>
      <td>{receipt.source}</td>
      <td className="font-mono text-[13px] text-muted">{receipt.checked}</td>
      <td className="text-right">
        {onMakeRule && (
          <button
            type="button"
            onClick={onMakeRule}
            aria-label={`Make ${receipt.spec} ${receipt.value} a rule`}
            className="inline-flex h-8 items-center gap-1 whitespace-nowrap rounded-[6px] border border-ink bg-paper-raised px-3 font-semibold text-[13px] text-ink hover:bg-ink/10 focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
          >
            <Plus size={12} aria-hidden="true" /> Make this a rule
          </button>
        )}
      </td>
    </tr>
  );
}
