import Link from "next/link";
import type { CatalogView } from "@/lib/shelf";
import { ListRows, Portholes } from "./icons";

const OPTIONS = [
  { view: "list", label: "List", Icon: ListRows },
  { view: "full", label: "Full view", Icon: Portholes },
] as const;

/** List / Full view switch. Plain links, so it works without JavaScript. */
export function ViewToggle({
  current,
  hrefFor,
}: {
  current: CatalogView;
  hrefFor: (view: CatalogView) => string;
}) {
  return (
    <nav aria-label="Catalog view" className="gh-viewtoggle">
      {OPTIONS.map(({ view, label, Icon }) => (
        <Link
          key={view}
          href={hrefFor(view)}
          aria-current={current === view ? "page" : undefined}
          scroll={false}
        >
          <Icon size={16} />
          <span>{label}</span>
        </Link>
      ))}
    </nav>
  );
}
