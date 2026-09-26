import { StatusMark } from "@/components/paper/status-mark";
import { cn } from "@/lib/utils";

export type Layer = {
  name: string;
  status: "pass" | "fail";
  detail: string;
};

/**
 * "What was checked — 4 layers, in order" (Purchase Paused design): cart
 * hash, merchant, amount within max, then the Cartel re-check.
 */
export function LayersTable({
  layers,
  caption = "What was checked, in order",
}: {
  layers: Layer[];
  caption?: string | undefined;
}) {
  return (
    <table className="sheet-formal w-full border-collapse text-left text-small text-graphite">
      <caption className="pb-2 text-left font-semibold font-serif text-h4">
        {caption}
      </caption>
      <thead className="text-meta text-muted uppercase tracking-label">
        <tr className="border-rule border-b">
          <th scope="col" className="w-10 px-3 py-2 font-semibold">
            #
          </th>
          <th scope="col" className="px-3 py-2 font-semibold">
            Layer
          </th>
          <th scope="col" className="px-3 py-2 font-semibold">
            Result
          </th>
        </tr>
      </thead>
      <tbody>
        {layers.map((l, i) => (
          <tr
            key={l.name}
            className={cn(
              "border-rule-soft border-b last:border-0",
              l.status === "fail" &&
                "bg-red-pen-wash shadow-[inset_3px_0_0_var(--color-red-pen)]",
            )}
          >
            <td className="num px-3 py-2.5 text-muted">{i + 1}</td>
            <th scope="row" className="px-3 py-2.5 font-semibold">
              {l.name}
            </th>
            <td className="px-3 py-2.5">
              <span className="flex flex-wrap items-center gap-x-2">
                <StatusMark status={l.status} />
                <span
                  className={
                    l.status === "fail" ? "text-red-pen" : "text-muted"
                  }
                >
                  {l.detail}
                </span>
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
