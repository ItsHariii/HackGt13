import { redirect } from "next/navigation";
import { FLAGSHIP_PLAN } from "@/lib/workspace-data";

/** Until plans are stored per user, "Your workspace" opens the demo plan. */
export default function Workspace() {
  redirect(`/plans/${FLAGSHIP_PLAN}`);
}
