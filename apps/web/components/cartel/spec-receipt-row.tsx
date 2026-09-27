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
      <table className="sheet-formal w-full border-collapse text-left text-small">
        <caption className="pb-2 text-left font-semibold font-serif text-h4 text-graphite">
          {caption}
        </caption>
        <thead className="text-meta text-muted uppercase tracking-label">
          <tr className="border-rule border-b">
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
    <tr className="group border-rule-soft border-b text-graphite last:border-0">
      <th scope="row" className="px-3 py-2.5 font-semibold">
        {receipt.spec}
      </th>
      <td className="num px-3 py-2.5 text-ink">{receipt.value}</td>
      <td className="px-3 py-2.5">
        <EvidenceBadge level={receipt.evidence} />
      </td>
      <td className="px-3 py-2.5">{receipt.source}</td>
      <td className="px-3 py-2.5 text-muted">{receipt.checked}</td>
      <td className="px-3 py-2.5 text-right">
        {onMakeRule && (
          <button
            type="button"
            onClick={onMakeRule}
            aria-label={`Make ${receipt.spec} ${receipt.value} a rule`}
            className="inline-flex min-h-6 items-center gap-1 whitespace-nowrap rounded-[5px] px-1.5 font-semibold text-ink text-meta hover:bg-ink/10 focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
          >
            <Plus size={12} aria-hidden="true" /> Make this a rule
          </button>
        )}
      </td>
    </tr>
  );
}
