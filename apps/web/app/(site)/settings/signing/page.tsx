import {
  type SigningKey,
  SigningSettings,
} from "@/components/signing/signing-settings";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

async function signingKeys(): Promise<SigningKey[] | null> {
  const client = await createClient();
  if (!client) return null;
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) return null;
  // RLS limits this to the signed-in user's own keys.
  const { data } = await client
    .from("signing_credentials")
    .select("id,device_label,created_at,last_used_at")
    .order("created_at");
  return (data ?? []).map((k) => ({
    id: k.id,
    label: k.device_label,
    createdAt: k.created_at,
    lastUsedAt: k.last_used_at,
  }));
}

export default async function Page() {
  return <SigningSettings keys={await signingKeys()} />;
}
