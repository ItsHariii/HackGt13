import { FLAGSHIP_BRIEF } from "@cartel/contracts/fixtures";
import { PACKS } from "@cartel/rule-packs";
import { memorySink } from "../calls";
import { formatUsd } from "../pricing";
import { draftRequirements } from "../requirements";
import { createRouter } from "../router";
import { cliConfig, loadLocalEnv } from "./env";

/*
 * `pnpm ai:warm` (TASKS T18.1): one A1 call on the flagship brief with every
 * pack, so the provider's prompt cache holds the A1 system prefix before the
 * demo. A second call reports how many input tokens came from the cache.
 * It also proves the key and model still answer.
 */

async function main(): Promise<void> {
  loadLocalEnv();
  if (process.env.AI_ENABLED === "false") {
    console.log("- AI_ENABLED=false: nothing to warm");
    return;
  }
  const config = cliConfig();
  if (!config.primary) {
    console.error(
      "✗ no AI provider has an API key (OPENAI_API_KEY, META_MODEL_API_KEY)",
    );
    process.exit(1);
  }
  const { sink } = memorySink();
  const router = createRouter({ config, sink });
  const input = {
    brief: FLAGSHIP_BRIEF,
    packs: Object.values(PACKS),
    today: new Date().toISOString().slice(0, 10),
  };
  for (const pass of ["warm", "check"] as const) {
    try {
      const { requirements, call } = await draftRequirements(router, input);
      console.log(
        `✓ A1 ${pass.padEnd(5)} ${call.provider}/${call.model} ${call.latencyMs} ms, ${requirements.length} requirements, ${call.cachedTokens}/${call.inputTokens + call.cachedTokens} input tokens cached, ${formatUsd(call.costUsdMicros)}`,
      );
    } catch (error) {
      console.error(
        `✗ A1 ${pass}: ${error instanceof Error ? error.message : "failed"}`,
      );
      process.exit(1);
    }
  }
}

await main();
