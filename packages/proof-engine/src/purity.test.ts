import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/*
 * T4.14 purity guard, second line of defence after Biome's
 * noRestrictedImports/noRestrictedGlobals: the engine, the rule packs and the
 * solver must stay pure (SDD §8.1). No network, no database, no model, no
 * filesystem, no clock and no randomness in their source. Tests are exempt:
 * they may read fixtures from disk.
 */

const PACKAGES = ["proof-engine", "rule-packs", "solver"];
const FORBIDDEN: [RegExp, string][] = [
  [/\bfetch\s*\(/, "fetch()"],
  [/\bXMLHttpRequest\b|\bWebSocket\b/, "network APIs"],
  [
    /from\s+["'](?:@supabase\/[^"']+|ai|@ai-sdk\/[^"']+|openai|node:fs[^"']*|fs|node:child_process|node:net|node:http|node:https)["']/,
    "an impure module",
  ],
  [/\bDate\.now\s*\(/, "Date.now()"],
  [/\bnew\s+Date\s*\(\s*\)/, "new Date() without an argument"],
  [/\bperformance\.now\s*\(/, "performance.now()"],
  [/\bMath\.random\s*\(/, "Math.random()"],
  [/\bcrypto\.getRandomValues\s*\(|\bcrypto\.randomUUID\s*\(/, "random values"],
  [/\bprocess\.env\b/, "process.env"],
];

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return sources(path);
    return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)
      ? [path]
      : [];
  });
}

describe("purity guard", () => {
  const root = join(import.meta.dirname, "..", "..");
  for (const pkg of PACKAGES) {
    it(`${pkg} source has no I/O, clock or randomness`, () => {
      const files = sources(join(root, pkg, "src"));
      expect(files.length).toBeGreaterThan(0);
      const violations = files.flatMap((file) => {
        const text = readFileSync(file, "utf8").replace(
          /^\s*(?:\/\/|\*).*$/gm,
          "",
        );
        return FORBIDDEN.filter(([re]) => re.test(text)).map(
          ([, what]) => `${file.slice(root.length + 1)}: ${what}`,
        );
      });
      expect(violations).toEqual([]);
    });
  }
});
