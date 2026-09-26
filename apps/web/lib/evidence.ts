import "server-only";
import { tapSigner } from "@proofcart/acp";
import { createDemoMartAdapter, enabledSources } from "@proofcart/evidence";
import {
  type EvidenceStore,
  supabaseEvidenceStore,
} from "@proofcart/evidence/supabase";
import { isConfigured, isHttpUrl } from "@proofcart/platform/env";
import { PACKS } from "@proofcart/rule-packs";
import { signingKeyFromEnv } from "@proofcart/tap";
import { createAdminClient } from "@/lib/supabase/admin";

/** Every rule pack ProofCart ships; adapters pick the ones a product's roles need. */
export const ALL_PACKS = Object.values(PACKS);

export function sources() {
  return enabledSources(process.env.SOURCES_ENABLED);
}

export function evidenceStore(db = createAdminClient()): EvidenceStore {
  return supabaseEvidenceStore(db);
}

/** DemoMart with ProofCart's agent key, or null when it is switched off or not configured. */
export async function demomartAdapter(store: EvidenceStore) {
  const base = process.env.DEMOMART_BASE_URL;
  if (
    !sources().has("demomart") ||
    !isHttpUrl(base) ||
    !isConfigured(process.env.AGENT_SIGNING_JWK)
  )
    return null;
  const key = await signingKeyFromEnv(
    process.env.AGENT_SIGNING_JWK,
    process.env.AGENT_KEY_ID,
  );
  return createDemoMartAdapter({
    baseUrl: base,
    store,
    signer: tapSigner(key),
  });
}
