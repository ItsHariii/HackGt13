import "server-only";
import { tapSigner } from "@cartel/acp";
import { createGreatHubAdapter, enabledSources } from "@cartel/evidence";
import {
  type EvidenceStore,
  supabaseEvidenceStore,
} from "@cartel/evidence/supabase";
import { isConfigured, isHttpUrl } from "@cartel/platform/env";
import { PACKS } from "@cartel/rule-packs";
import { signingKeyFromEnv } from "@cartel/tap";
import { createAdminClient } from "@/lib/supabase/admin";

/** Every rule pack Cartel ships; adapters pick the ones a product's roles need. */
export const ALL_PACKS = Object.values(PACKS);

export function sources() {
  return enabledSources(process.env.SOURCES_ENABLED);
}

export function evidenceStore(db = createAdminClient()): EvidenceStore {
  return supabaseEvidenceStore(db);
}

/** GreatHub with Cartel's agent key, or null when it is switched off or not configured. */
export async function greathubAdapter(store: EvidenceStore) {
  const base = process.env.GREATHUB_BASE_URL;
  if (
    !sources().has("greathub") ||
    !isHttpUrl(base) ||
    !isConfigured(process.env.AGENT_SIGNING_JWK)
  )
    return null;
  const key = await signingKeyFromEnv(
    process.env.AGENT_SIGNING_JWK,
    process.env.AGENT_KEY_ID,
  );
  return createGreatHubAdapter({
    baseUrl: base,
    store,
    signer: tapSigner(key),
  });
}
