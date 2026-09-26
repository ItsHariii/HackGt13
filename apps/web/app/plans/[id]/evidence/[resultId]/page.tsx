import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EvidenceDrawer } from "@/components/workspace/evidence-drawer";
import { Workspace } from "@/components/workspace/workspace";
import { loadWorkspace } from "@/lib/workspace-data";

export async function generateMetadata({
  params,
}: PageProps<"/plans/[id]/evidence/[resultId]">): Promise<Metadata> {
  const { id, resultId } = await params;
  const view = await loadWorkspace(id);
  const evidence = view?.evidence[decodeURIComponent(resultId)];
  return { title: evidence ? `Evidence · ${evidence.row.rule}` : "Evidence" };
}

/** A shared or reloaded evidence link: the workspace with the drawer open. */
export default async function EvidencePage({
  params,
}: PageProps<"/plans/[id]/evidence/[resultId]">) {
  const { id, resultId } = await params;
  const view = await loadWorkspace(id);
  const key = decodeURIComponent(resultId);
  const evidence = view?.evidence[key];
  if (!view || !evidence) notFound();
  return (
    <Workspace
      view={view}
      activeId={key}
      drawer={
        <EvidenceDrawer
          evidence={evidence}
          closeHref={`/plans/${id}`}
          mode="page"
        />
      }
    />
  );
}
