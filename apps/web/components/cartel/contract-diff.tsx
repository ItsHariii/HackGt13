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
    <table className="sheet-formal w-full border-collapse font-mono text-[13px] text-graphite">
      <caption className="pb-2 text-left font-sans text-meta text-muted uppercase tracking-label">
        {caption ?? `Changes · ${from} → ${to}`}
      </caption>
      <tbody>
        {lines.map((l, i) => {
          if (l.kind === "gap")
            return (
              // biome-ignore lint/suspicious/noArrayIndexKey: lines are positional
              <tr key={i} className="text-muted">
                <td colSpan={5} className="px-3 py-1 text-center">
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
                "border-rule-soft border-b last:border-0",
                l.kind === "del" && "diff-del",
                l.kind === "add" && "diff-add",
              )}
            >
              <td className="w-9 select-none px-2 py-1.5 text-right text-muted">
                {n}
              </td>
              <td className="w-6 select-none py-1.5 text-center font-bold">
                {l.kind === "del" ? "−" : l.kind === "add" ? "+" : " "}
                <span className="sr-only">
                  {l.kind === "del"
                    ? "Removed"
                    : l.kind === "add"
                      ? "Added"
                      : "Unchanged"}
                </span>
              </td>
              <td className="w-[124px] py-1.5 pr-3 font-semibold">{l.label}</td>
              <td className="py-1.5 pr-3">{l.text}</td>
              <td className="py-1.5 pr-3 text-right tabular-nums">
                {l.amount}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
