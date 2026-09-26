import { z } from "zod";
import { memorySink } from "../calls";
import {
  type AiConfig,
  type AiTask,
  modelFor,
  PROVIDER_IDS,
  type ProviderConfig,
} from "../config";
import { formatUsd } from "../pricing";
import { createRouter } from "../router";
import { cliConfig, loadLocalEnv } from "./env";

/*
 * `pnpm ai:smoke`: for every configured provider, list the models the key can
 * see and make one structured call per model role, so a bad key or a renamed
 * model fails here and not in front of the judges (TASKS T9.1).
 */

const OPENAI_BASE_URL = "https://api.openai.com/v1";
const Ping = z.object({ ok: z.boolean(), word: z.string() });

async function listModels(
  p: ProviderConfig,
): Promise<{ ok: boolean; detail: string }> {
  const base = (p.baseUrl ?? OPENAI_BASE_URL).replace(/\/$/, "");
  try {
    const res = await fetch(`${base}/models`, {
      headers: { authorization: `Bearer ${p.apiKey}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` };
    const body = (await res.json()) as { data?: { id?: string }[] };
    const ids = new Set((body.data ?? []).map((m) => m.id));
    const wanted = [...new Set([p.models.primary, p.models.fast])];
    const missing = wanted.filter((m) => !ids.has(m));
    return missing.length === 0
      ? { ok: true, detail: `${ids.size} models; ${wanted.join(", ")} listed` }
      : {
          ok: false,
          detail: `${ids.size} models; not listed: ${missing.join(", ")}`,
        };
  } catch (error) {
    return {
      ok: false,
      detail: error instanceof Error ? error.name : "failed",
    };
  }
}

async function structured(
  config: AiConfig,
  p: ProviderConfig,
  task: AiTask,
): Promise<{ ok: boolean; detail: string }> {
  const { sink, records } = memorySink();
  const router = createRouter({
    config: { ...config, primary: p.id, fallback: null, retries: 0 },
    sink,
  });
  try {
    const { output, call } = await router.run({
      task,
      schema: Ping,
      schemaName: "smoke",
      system:
        "You are a health check. Answer with the JSON the schema asks for.",
      prompt: 'Set ok to true and word to "ready".',
      maxOutputTokens: 1_000,
    });
    const good = output.ok && output.word.trim().toLowerCase() === "ready";
    return {
      ok: good,
      detail: `${call.latencyMs} ms, ${formatUsd(call.costUsdMicros)}${good ? "" : `, unexpected ${JSON.stringify(output)}`}`,
    };
  } catch (error) {
    const reason =
      records.at(-1)?.error ??
      (error instanceof Error ? error.message : "failed");
    return { ok: false, detail: reason };
  }
}

async function main(): Promise<void> {
  const loaded = loadLocalEnv();
  const config = cliConfig();
  console.log(`env: ${loaded.join(", ") || "shell only"}`);
  const providers = PROVIDER_IDS.flatMap((id) => {
    const p = config.providers[id];
    return p ? [p] : [];
  });
  if (providers.length === 0) {
    console.error(
      "✗ no AI provider has an API key (OPENAI_API_KEY, META_MODEL_API_KEY)",
    );
    process.exit(1);
  }

  let failed = 0;
  const line = (ok: boolean, what: string, detail: string) => {
    if (!ok) failed++;
    console.log(`${ok ? "✓" : "✗"} ${what.padEnd(34)} ${detail}`);
  };
  for (const [name, id] of [
    ["AI_PROVIDER", config.primary],
    ["AI_FALLBACK_PROVIDER", config.fallback],
  ] as const) {
    if (id && !config.providers[id]) {
      line(false, `${id} (${name})`, "named but has no usable API key");
    }
  }
  for (const p of providers) {
    const models = await listModels(p);
    line(models.ok, `${p.id} GET /models`, models.detail);
    const tasks: AiTask[] =
      p.models.primary === p.models.fast ? ["A5"] : ["A1", "A5"];
    for (const task of tasks) {
      const result = await structured(config, p, task);
      line(
        result.ok,
        `${p.id} ${modelFor(p, task)} Output.object()`,
        result.detail,
      );
    }
  }
  if (!config.fallback)
    console.log("! AI_FALLBACK_PROVIDER is not set: no fallback");
  process.exit(failed > 0 ? 1 : 0);
}

await main();
