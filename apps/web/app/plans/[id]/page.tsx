import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Workspace } from "@/components/workspace/workspace";
import { loadWorkspace } from "@/lib/workspace-data";

export async function generateMetadata({
  params,
}: PageProps<"/plans/[id]">): Promise<Metadata> {
  const view = await loadWorkspace((await params).id);
  return { title: view ? `${view.title} · Plans` : "Plan" };
}

export default async function PlanPage({ params }: PageProps<"/plans/[id]">) {
  const view = await loadWorkspace((await params).id);
  if (!view) notFound();
  return <Workspace view={view} />;
}
