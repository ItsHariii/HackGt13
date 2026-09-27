import { cn } from "@/lib/utils";

export type DiffLine =
  | {
      kind: "ctx" | "del" | "add";
      label: string;
      text: string;
      amount?: string | undefined;
    }
  | { kind: "gap" };

/**
 * A contract change as a git-style diff (Revised contract design): context,
 * removed and added lines in Geist Mono, with line numbers. Removed and
 * added lines say so in text as well as color.
 */
export function ContractDiff({
  from,
  to,
  lines,
  caption,
}: {
  from: string;
  to: string;
  lines: DiffLine[];
  caption?: string | undefined;
}) {
  let n = 0;
  return (
    <table className="w-full border-collapse border border-graphite bg-paper-sheet font-mono text-[14px] text-graphite-2 tabular-nums">
      <caption className="pb-3 text-left font-bold font-sans text-[12px] text-graphite uppercase tracking-[0.1em]">
        {caption ?? `Changes · ${from} → ${to}`}
      </caption>
      <tbody>
        {lines.map((l, i) => {
          if (l.kind === "gap")
            return (
              <tr
                // biome-ignore lint/suspicious/noArrayIndexKey: lines are positional
                key={i}
                className="h-6 border-rule border-t bg-[#f6f1e4] text-muted dark:bg-paper-shade"
              >
                <td colSpan={5} className="w-10 pr-2.5 text-left">
                  <span aria-hidden="true">⋯</span>
                  <span className="sr-only">Unchanged lines</span>
                </td>
              </tr>
            );
          n += 1;
          return (
            <tr
              // biome-ignore lint/suspicious/noArrayIndexKey: lines are positional
              key={i}
              className={cn(
                "h-9 border-rule-soft border-t first:border-t-0",
                l.kind === "del" &&
                  "bg-diff-del font-semibold text-diff-del-text",
                l.kind === "add" &&
                  "bg-diff-add font-semibold text-diff-add-text",
              )}
            >
              <td className="w-10 select-none pr-2.5 text-right font-normal text-[12px] text-muted">
                {n}
              </td>
              <td className="w-[26px] select-none text-center font-bold">
                {l.kind === "del" ? "−" : l.kind === "add" ? "+" : " "}
                <span className="sr-only">
                  {l.kind === "del"
                    ? "Removed"
                    : l.kind === "add"
                      ? "Added"
                      : "Unchanged"}
                </span>
              </td>
              <td className="w-[124px] pr-3">{l.label}</td>
              <td className="pr-3 font-normal">{l.text}</td>
              <td className="w-[92px] pr-3.5 text-right">{l.amount}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
