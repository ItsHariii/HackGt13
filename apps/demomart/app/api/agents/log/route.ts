import { db } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** The public TAP verification log (T6.6). Key IDs and verdicts only. */
export async function GET() {
  const { data, error } = await db()
    .from("agent_log")
    .select(
      "id, request_id, method, path, key_id, tag, verdict, reason, created_at",
    )
    .order("id", { ascending: false })
    .limit(100);
  if (error) return Response.json({ error: "unavailable" }, { status: 503 });
  return Response.json(
    { entries: data },
    { headers: { "Cache-Control": "no-store" } },
  );
}
