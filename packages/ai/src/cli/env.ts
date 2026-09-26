import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type AiConfig,
  type ProviderId,
  providerChain,
  readAiConfig,
} from "../config";

const ROOT = resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  "../../../..",
);

/**
 * Loads the web app's local env, then the repo root's. Variables already set
 * in the shell win, so `OPENAI_MODEL_PRIMARY=gpt-6-luna pnpm eval:ai` works.
 */
export function loadLocalEnv(): string[] {
  const loaded: string[] = [];
  for (const rel of ["apps/web/.env.local", ".env.local"]) {
    const file = resolve(ROOT, rel);
    if (!existsSync(file)) continue;
    process.loadEnvFile(file);
    loaded.push(rel);
  }
  return loaded;
}

export function arg(name: string): string | undefined {
  const argv = process.argv.slice(2);
  const at = argv.findIndex(
    (a) => a === `--${name}` || a.startsWith(`--${name}=`),
  );
  if (at < 0) return undefined;
  const hit = argv[at] as string;
  return hit.includes("=") ? hit.slice(hit.indexOf("=") + 1) : argv[at + 1];
}

export function flag(name: string): boolean {
  return process.argv.slice(2).includes(`--${name}`);
}

/**
 * Applies `--provider` (run on that provider only, no fallback) and `--model`
 * (use one model for both roles) on top of the env configuration.
 */
export function cliConfig(): AiConfig {
  const config = readAiConfig();
  const provider = arg("provider") as ProviderId | undefined;
  const model = arg("model");
  const chain = providerChain(config);
  const primary = provider ?? chain[0]?.id ?? null;
  const next: AiConfig = {
    ...config,
    enabled: true,
    primary,
    fallback: provider ? null : config.fallback,
  };
  if (model && primary && next.providers[primary]) {
    next.providers = {
      ...next.providers,
      [primary]: {
        ...next.providers[primary],
        models: { primary: model, fast: model },
      },
    };
  }
  return next;
}

export function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}
