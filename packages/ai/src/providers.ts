import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";
import type { AiTask, ProviderConfig, ReasoningEffort } from "./config";
import { modelFor } from "./config";

/*
 * Both providers speak the same AI SDK interface, so switching is an env
 * change (SDD §10.4). Meta's API is OpenAI-compatible Chat Completions.
 */

export type ModelResolver = (
  provider: ProviderConfig,
  task: AiTask,
) => LanguageModel;

const cache = new Map<string, LanguageModel>();

function build(provider: ProviderConfig, model: string): LanguageModel {
  if (provider.id === "openai") {
    const openai = createOpenAI({
      apiKey: provider.apiKey,
      ...(provider.baseUrl ? { baseURL: provider.baseUrl } : {}),
    });
    return openai(model);
  }
  const meta = createOpenAICompatible({
    name: provider.id,
    baseURL: provider.baseUrl ?? "",
    apiKey: provider.apiKey,
  });
  return meta.chatModel(model);
}

/** Default resolver. Models are cached per provider, base URL and model id. */
export const resolveModel: ModelResolver = (provider, task) => {
  const model = modelFor(provider, task);
  const key = `${provider.id}:${provider.baseUrl ?? ""}:${model}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const built = build(provider, model);
  cache.set(key, built);
  return built;
};

/**
 * Provider-specific call options. Only OpenAI takes `reasoningEffort`; the
 * compatible endpoint would reject an unknown field.
 */
export function providerOptions(
  provider: ProviderConfig,
  effort: ReasoningEffort,
): Record<string, Record<string, string>> | undefined {
  if (provider.id !== "openai") return undefined;
  return { openai: { reasoningEffort: effort } };
}
