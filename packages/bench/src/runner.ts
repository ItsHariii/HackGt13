import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import type { AutonomyPreset, ConsentDiff } from "@cartel/contracts";
import { atLeast, consentDiff } from "@cartel/proof-engine";
import { runAgentScenario } from "./agent";
import { liveCheckout } from "./mutate";
import {
  CATEGORY_LABELS,
  type Category,
  type ConsentScenario,
  isMaterial,
  Scenario,
} from "./scenario";
import { WORLDS, type WorldId } from "./worlds";

/*
 * ProofBench runner (TASKS T16.1). Every consent scenario re-proves a
 * mutated checkout with the pure engine against a contract signed for its
 * world; every agent scenario presents a request to the merchant's TAP
 * policy. Nothing here decides an outcome: the engine's classification (or
 * the verifier's verdict) is compared with the scenario's expectation.
 */

export const SCENARIO_DIR = fileURLToPath(
  new URL("../scenarios/", import.meta.url),
);

export type LoadedScenario = Scenario & { file: string };

/** Reads every `*.json` under `dir` (one scenario or an array per file). */
export function loadScenarios(dir = SCENARIO_DIR): LoadedScenario[] {
  const out: LoadedScenario[] = [];
  const walk = (d: string) => {
    for (const name of readdirSync(d).sort()) {
      const path = join(d, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (name.endsWith(".json")) {
        const raw: unknown = JSON.parse(readFileSync(path, "utf8"));
        const items = Array.isArray(raw) ? raw : [raw];
        items.forEach((item, i) => {
          const parsed = Scenario.safeParse(item);
          if (!parsed.success) {
            throw new Error(
              `${relative(dir, path)}[${i}]: ${parsed.error.issues
                .map((x) => `${x.path.join(".")}: ${x.message}`)
                .join("; ")}`,
            );
          }
          out.push({ ...parsed.data, file: relative(dir, path) });
        });
      }
    }
  };
  walk(dir);
  const ids = new Set<string>();
  for (const s of out) {
    if (ids.has(s.id)) throw new Error(`duplicate scenario id ${s.id}`);
    ids.add(s.id);
  }
  return out;
}

export type ScenarioResult = {
  id: string;
  name: string;
  category: Category;
  /** Display label for the category, as /bench shows it. */
  categoryLabel: string;
  kind: Scenario["kind"];
  /** Whether the mutation must stop payment. */
  material: boolean;
  expected: string;
  actual: string;
  passed: boolean;
  /** Kept for /bench: a scenario is "caught" when the guard did what it should. */
  caught: boolean;
  /** Why it failed, when it did. */
  failures: string[];
  /** Policy bases of the changes that set the classification. */
  bases: string[];
  /** Hard requirements that passed below their evidence floor (a release-gate breach). */
  hardPassBelowFloor: string[];
  ms: number;
};

type Approved = Awaited<ReturnType<(typeof WORLDS)[WorldId]["approve"]>>;
const approvals = new Map<string, Promise<Approved>>();

function approvedFor(world: WorldId, preset: AutonomyPreset) {
  const key = `${world}:${preset}`;
  let p = approvals.get(key);
  if (!p) {
    p = WORLDS[world].approve(preset);
    approvals.set(key, p);
  }
  return p;
}

export type ConsentRun = {
  diff: ConsentDiff;
  hardPassBelowFloor: string[];
  verdicts: Record<string, string>;
};

export async function runConsent(s: ConsentScenario): Promise<ConsentRun> {
  const world = WORLDS[s.world];
  const approved = await approvedFor(s.world, s.preset);
  const now = s.at ?? world.now;
  const live = liveCheckout(world, s.mutation, now);
  const { diff, reproof } = await consentDiff(approved, live, world.packs, now);
  const reqs = new Map(approved.contract.requirements.map((r) => [r.id, r]));
  const hardPassBelowFloor = reproof.results
    .filter((r) => {
      const req = reqs.get(r.requirementId);
      return (
        r.importance === "hard" &&
        r.verdict === "pass" &&
        req !== undefined &&
        !atLeast(r.evidenceState, req.evidence.minStateToPass)
      );
    })
    .map((r) => r.requirementId);
  const verdicts: Record<string, string> = {};
  for (const r of reproof.results) {
    // A requirement over several items reads as its worst verdict.
    const prev = verdicts[r.requirementId];
    verdicts[r.requirementId] =
      prev === "fail" || r.verdict === "fail"
        ? "fail"
        : prev === "unknown" || r.verdict === "unknown"
          ? "unknown"
          : "pass";
  }
  return { diff, hardPassBelowFloor, verdicts };
}

export async function runScenario(s: Scenario): Promise<ScenarioResult> {
  const started = performance.now();
  const failures: string[] = [];
  let expected: string;
  let actual: string;
  let bases: string[] = [];
  let hardPassBelowFloor: string[] = [];
  try {
    if (s.kind === "agent_request") {
      const out = await runAgentScenario(s);
      expected = s.expected.accepted
        ? "accepted"
        : `rejected${s.expected.reason ? `:${s.expected.reason}` : ""}`;
      actual = out.accepted ? "accepted" : `rejected:${out.reason}`;
      if (out.accepted !== s.expected.accepted)
        failures.push(`expected ${expected}, got ${actual}`);
      else if (
        !out.accepted &&
        s.expected.reason &&
        out.reason !== s.expected.reason
      )
        failures.push(
          `expected reason ${s.expected.reason}, got ${out.reason}`,
        );
      if (!out.accepted) bases = [out.reason ?? "rejected"];
    } else {
      const run = await runConsent(s);
      const { diff } = run;
      hardPassBelowFloor = run.hardPassBelowFloor;
      expected = s.expected.classification;
      actual = diff.classification;
      bases = diff.changes
        .filter(
          (c) =>
            c.class !== "info" &&
            (diff.classification === "identical" ||
              c.class === diff.classification),
        )
        .map((c) => c.basis);
      if (actual !== expected)
        failures.push(`expected ${expected}, got ${actual}`);
      for (const [id, v] of Object.entries(s.expected.verdicts ?? {})) {
        if (run.verdicts[id] !== v)
          failures.push(
            `${id}: expected ${v}, got ${run.verdicts[id] ?? "no result"}`,
          );
      }
      const all = new Set(diff.changes.map((c) => c.basis));
      for (const b of s.expected.bases ?? []) {
        if (!all.has(b)) failures.push(`missing basis ${b}`);
      }
      if (hardPassBelowFloor.length > 0)
        failures.push(
          `hard pass below evidence floor: ${hardPassBelowFloor.join(", ")}`,
        );
    }
  } catch (e) {
    expected = s.kind === "agent_request" ? "—" : s.expected.classification;
    actual = "error";
    failures.push((e as Error).message);
  }
  const passed = failures.length === 0;
  return {
    id: s.id,
    name: s.name,
    category: s.category,
    categoryLabel: CATEGORY_LABELS[s.category],
    kind: s.kind,
    material: isMaterial(s),
    expected,
    actual,
    passed,
    caught: passed,
    failures,
    bases: [...new Set(bases)],
    hardPassBelowFloor,
    ms: Math.round((performance.now() - started) * 10) / 10,
  };
}

export async function runAll(
  scenarios: readonly Scenario[],
): Promise<ScenarioResult[]> {
  const out: ScenarioResult[] = [];
  for (const s of scenarios) out.push(await runScenario(s));
  return out;
}
