import { isConfigured, isHttpUrl } from "@cartel/platform/env";

/*
 * Configuration for the bounded AI roles (SDD §10.1, §10.4). Everything the
 * router needs comes from the environment once, so a missing key or a renamed
 * model is a configuration problem the smoke script can see, not a failure in
 * the middle of a demo.
 */

export const AI_TASKS = ["A1", "A2", "A3", "A4", "A5"] as const;
export type AiTask = (typeof AI_TASKS)[number];

/** Model size per task: A1, A2 and A4 reason; A3 and A5 are cheap and fast. */
export type ModelRole = "primary" | "fast";
export const TASK_ROLE: Record<AiTask, ModelRole> = {
  A1: "primary",
  A2: "primary",
  A3: "fast",
  A4: "primary",
  A5: "fast",
};

export const PROVIDER_IDS = ["openai", "meta"] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

export const REASONING_EFFORTS = ["none", "low", "medium"] as const;
export type ReasoningEffort = (typeof REASONING_EFFORTS)[number];

export type ProviderConfig = {
  id: ProviderId;
  apiKey: string;
  /** Required for `meta` (OpenAI-compatible Chat Completions), optional for OpenAI. */
  baseUrl?: string;
  models: Record<ModelRole, string>;
};

export type BreakerConfig = {
  /** Failures inside `windowMs` that open the breaker. */
  failures: number;
  windowMs: number;
  /** How long the breaker stays open before it lets one call through. */
  cooldownMs: number;
};

export type AiConfig = {
  /** `AI_ENABLED=false` is the "AI off" mode: every caller uses its fallback. */
  enabled: boolean;
  primary: ProviderId | null;
  fallback: ProviderId | null;
  providers: Partial<Record<ProviderId, ProviderConfig>>;
  reasoningEffort: ReasoningEffort;
  timeoutMs: number;
  /** Retries per provider, on top of the first attempt. */
  retries: number;
  breaker: BreakerConfig;
};

export const AI_DEFAULTS = {
  timeoutMs: 12_000,
  retries: 2,
  breaker: { failures: 3, windowMs: 60_000, cooldownMs: 60_000 },
} as const;

const DEFAULT_MODELS: Record<ProviderId, Record<ModelRole, string>> = {
  openai: { primary: "gpt-6-sol", fast: "gpt-6-luna" },
  meta: { primary: "muse-spark-1.3", fast: "muse-spark-1.3" },
};

const DEFAULT_BASE_URL: Partial<Record<ProviderId, string>> = {
  meta: "https://api.meta.ai/v1",
};

export type Env = Readonly<Record<string, string | undefined>>;

function providerId(value: string | undefined): ProviderId | null {
  const id = value?.trim().toLowerCase();
  return PROVIDER_IDS.find((p) => p === id) ?? null;
}

function flag(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim() === "") return fallback;
  return !/^(0|false|no|off)$/i.test(value.trim());
}

function positiveInt(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

function readProvider(id: ProviderId, env: Env): ProviderConfig | null {
  const prefix = id === "openai" ? "OPENAI" : "META_MODEL";
  const apiKey = env[`${prefix}_API_KEY`];
  if (!isConfigured(apiKey)) return null;
  const baseUrl = env[id === "openai" ? "OPENAI_BASE_URL" : "META_BASE_URL"];
  const models = DEFAULT_MODELS[id];
  const modelPrefix = id === "openai" ? "OPENAI" : "META";
  const primary = env[`${modelPrefix}_MODEL_PRIMARY`]?.trim();
  const fast = env[`${modelPrefix}_MODEL_FAST`]?.trim();
  const resolvedBaseUrl = isHttpUrl(baseUrl) ? baseUrl : DEFAULT_BASE_URL[id];
  // The OpenAI-compatible provider cannot guess a base URL.
  if (id !== "openai" && !resolvedBaseUrl) return null;
  return {
    id,
    apiKey,
    ...(resolvedBaseUrl ? { baseUrl: resolvedBaseUrl } : {}),
    models: {
      primary: primary || models.primary,
      fast: fast || models.fast,
    },
  };
}

/**
 * Reads the AI configuration. A provider without a usable key is simply
 * absent, so `providerChain` skips it instead of failing at call time.
 */
export function readAiConfig(env: Env = process.env): AiConfig {
  const providers: Partial<Record<ProviderId, ProviderConfig>> = {};
  for (const id of PROVIDER_IDS) {
    const p = readProvider(id, env);
    if (p) providers[id] = p;
  }
  const effortInput = env.OPENAI_REASONING_EFFORT?.trim().toLowerCase();
  const reasoningEffort =
    REASONING_EFFORTS.find((e) => e === effortInput) ?? "low";
  return {
    enabled: flag(env.AI_ENABLED, true),
    primary: providerId(env.AI_PROVIDER) ?? "openai",
    fallback: providerId(env.AI_FALLBACK_PROVIDER),
    providers,
    reasoningEffort,
    timeoutMs: positiveInt(env.AI_TIMEOUT_MS, AI_DEFAULTS.timeoutMs),
    retries: positiveInt(env.AI_RETRIES, AI_DEFAULTS.retries),
    breaker: { ...AI_DEFAULTS.breaker },
  };
}

/** The model a task uses on one provider. */
export function modelFor(provider: ProviderConfig, task: AiTask): string {
  return provider.models[TASK_ROLE[task]];
}

/**
 * Configured providers in the order the router tries them: the primary first,
 * then the fallback. Duplicates and unconfigured providers are dropped.
 */
export function providerChain(config: AiConfig): readonly ProviderConfig[] {
  const chain: ProviderConfig[] = [];
  for (const id of [config.primary, config.fallback]) {
    if (!id) continue;
    const p = config.providers[id];
    if (p && !chain.some((c) => c.id === p.id)) chain.push(p);
  }
  return chain;
}

/** The reasoning effort a task asks for: none for the fast roles (SDD §10.1). */
export function effortFor(config: AiConfig, task: AiTask): ReasoningEffort {
  return TASK_ROLE[task] === "fast" ? "none" : config.reasoningEffort;
}
