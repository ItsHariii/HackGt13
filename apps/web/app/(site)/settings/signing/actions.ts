"use server";
import { revalidatePath } from "next/cache";
import { UUID } from "@/lib/catalog";
import { createClient } from "@/lib/supabase/server";

/** Removes one of the person's signing passkeys; RLS limits it to their own. */
export async function removePasskey(form: FormData): Promise<void> {
  const id = String(form.get("id") ?? "");
  if (!UUID.test(id)) return;
  const db = await createClient();
  if (!db) return;
  const { data } = await db.auth.getUser();
  if (!data.user) return;
  await db
    .from("signing_credentials")
    .delete()
    .eq("id", id)
    .eq("user_id", data.user.id);
  revalidatePath("/settings/signing");
}
