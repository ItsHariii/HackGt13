import "server-only";
import { Requirement, requirementSetHash } from "@cartel/contracts";
import type { Pack } from "@cartel/proof-engine";
import { PACKS } from "@cartel/rule-packs";
import { UUID } from "./catalog";
import { createClient } from "./supabase/server";

/*
 * Plans a person saved (plans, requirement_sets, requirements). Every read
 * and write goes through the user's own Supabase session, so row-level
 * security decides what they can see; nothing here uses the service key.
 */

export type StoredPlan = {
  id: string;
  title: string;
  brief: string;
  packs: Pack[];
  setVersion: number;
  requirements: Requirement[];
};

export class PlanError extends Error {
  constructor(
    readonly code:
      | "not_configured"
      | "no_session"
      | "not_found"
      | "invalid"
      | "storage",
  ) {
    super(code);
  }
}

async function session() {
  const db = await createClient();
  if (!db) throw new PlanError("not_configured");
  const { data } = await db.auth.getUser();
  if (!data.user) throw new PlanError("no_session");
  return { db, user: data.user.id };
}

function packsOf(ids: readonly string[]): Pack[] {
  return ids.flatMap((id) => (PACKS[id] ? [PACKS[id]] : []));
}

/** A title from the pack, or the brief's first words. */
export function planTitle(brief: string, pack: string | null): string {
  if (pack && PACKS[pack]) return PACKS[pack].title;
  const words = brief.trim().split(/\s+/).slice(0, 6).join(" ");
  return words.length > 60 ? `${words.slice(0, 57)}…` : words || "New plan";
}

export async function createStoredPlan(input: {
  brief: string;
  pack: string | null;
}): Promise<string> {
  const { db } = await session();
  const { data, error } = await db
    .from("plans")
    .insert({
      title: planTitle(input.brief, input.pack),
      brief: input.brief,
      packs: input.pack && PACKS[input.pack] ? [input.pack] : [],
    })
    .select("id")
    .single();
  if (error || !data) throw new PlanError("storage");
  return data.id;
}

/** The plan and its latest requirement set, or null if it isn't theirs. */
export async function loadStoredPlan(
  planId: string,
): Promise<StoredPlan | null> {
  if (!UUID.test(planId)) return null;
  let s: Awaited<ReturnType<typeof session>>;
  try {
    s = await session();
  } catch {
    return null;
  }
  const plan = await s.db
    .from("plans")
    .select("id,title,brief,packs")
    .eq("id", planId)
    .maybeSingle();
  if (plan.error || !plan.data) return null;
  const set = await s.db
    .from("requirement_sets")
    .select("id,version,requirements(spec)")
    .eq("plan_id", planId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  const requirements = (set.data?.requirements ?? []).flatMap((r) => {
    const parsed = Requirement.safeParse(r.spec);
    return parsed.success ? [parsed.data] : [];
  });
  return {
    id: plan.data.id,
    title: plan.data.title,
    brief: plan.data.brief ?? "",
    packs: packsOf(plan.data.packs),
    setVersion: set.data?.version ?? 0,
    requirements,
  };
}

/** Saves the rules as the plan's next requirement set version. */
export async function saveRequirementSet(
  planId: string,
  raw: unknown,
): Promise<number> {
  if (!UUID.test(planId)) throw new PlanError("invalid");
  const parsed = Requirement.array().max(64).safeParse(raw);
  if (!parsed.success) throw new PlanError("invalid");
  const reqs = parsed.data;
  if (new Set(reqs.map((r) => r.id)).size !== reqs.length)
    throw new PlanError("invalid");
  if (reqs.some((r) => !/^[a-z][a-z0-9_]{0,63}$/.test(r.id)))
    throw new PlanError("invalid");
  const { db, user } = await session();
  const latest = await db
    .from("requirement_sets")
    .select("id,version")
    .eq("plan_id", planId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latest.error) throw new PlanError("storage");
  const version = (latest.data?.version ?? 0) + 1;
  const set = await db
    .from("requirement_sets")
    .insert({
      plan_id: planId,
      version,
      parent_id: latest.data?.id ?? null,
      hash: await requirementSetHash(reqs),
      created_by: `user:${user}`,
    })
    .select("id")
    .single();
  if (set.error || !set.data) throw new PlanError("not_found");
  if (reqs.length) {
    const rows = await db.from("requirements").insert(
      reqs.map((r) => ({
        set_id: set.data.id,
        requirement_key: r.id,
        spec: r as never,
        importance: r.importance,
        provenance_kind: r.provenance.kind,
        confirmed:
          r.provenance.kind === "ai_inferred" ? r.provenance.confirmed : true,
      })),
    );
    if (rows.error) throw new PlanError("storage");
  }
  return version;
}
