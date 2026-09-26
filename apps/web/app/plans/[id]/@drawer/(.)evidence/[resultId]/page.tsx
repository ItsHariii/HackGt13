import { EvidenceDrawer } from "@/components/workspace/evidence-drawer";
import { loadWorkspace } from "@/lib/workspace-data";

/** Evidence opened from a proof row: shown over the workspace. */
export default async function EvidenceOverlay({
  params,
}: PageProps<"/plans/[id]/evidence/[resultId]">) {
  const { id, resultId } = await params;
  const view = await loadWorkspace(id);
  const evidence = view?.evidence[decodeURIComponent(resultId)];
  if (!evidence) return null;
  return (
    <EvidenceDrawer
      evidence={evidence}
      closeHref={`/plans/${id}`}
      mode="overlay"
    />
  );
}
