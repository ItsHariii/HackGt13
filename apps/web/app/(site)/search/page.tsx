import { buildFacets } from "@cartel/catalog";
import type { Metadata } from "next";
import { SearchView } from "@/components/search/search-view";
import { catalogConnected } from "@/lib/catalog-read";
import { DEMO_NOW, demoSearch } from "@/lib/demo-catalog";
import { ALL_PACKS, sources } from "@/lib/evidence";

export const metadata: Metadata = { title: "Search" };

const SEARCHABLE = ["greathub", "upcitemdb", "shopify", "icecat"];

/** /search (TASKS T11.16). */
export default async function SearchPage({
  searchParams,
}: PageProps<"/search">) {
  const raw = (await searchParams).q;
  const query = (Array.isArray(raw) ? raw[0] : raw)?.trim().slice(0, 200) ?? "";
  const connected = catalogConnected();
  const products = !connected && query ? demoSearch(query) : [];
  return (
    <SearchView
      key={query}
      query={query}
      sources={[...sources()].filter((s) => SEARCHABLE.includes(s))}
      demo={
        connected
          ? null
          : { products, facets: buildFacets(products, ALL_PACKS, DEMO_NOW) }
      }
      now={connected ? new Date().toISOString() : DEMO_NOW}
    />
  );
}
