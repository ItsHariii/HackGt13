import { writeFileSync } from "node:fs";
import { apparel, homeOffice, travel } from "@cartel/rule-packs";
import { memorySink } from "../calls";
import { modelFor, providerChain } from "../config";
import { EVAL_CASES } from "../evals/cases";
import { INJECTION_CASES, runInjectionCase } from "../evals/injection";
import { EVAL_TARGET, runEval } from "../evals/score";
import { formatUsd } from "../pricing";
import { createRouter } from "../router";
import { arg, cliConfig, flag, loadLocalEnv, pct } from "./env";

/*
 * `pnpm eval:ai [--provider openai|meta] [--model id] [--case id] [--out file]
 * [--no-injection]`: the A1 brief set (T9.6) and the A3 injection set (T9.7).
 * Run on gpt-6-luna while developing (`--model gpt-6-luna`); before G4 run
 * once on gpt-6-sol and once with `--provider meta`.
 */

const PACKS = [homeOffice, apparel, travel];

async function main(): Promise<void> {
  loadLocalEnv();
  const config = cliConfig();
  const chain = providerChain(config);
  const head = chain[0];
  if (!head) {
    console.error("✗ no AI provider has an API key");
    process.exit(1);
  }
  const { sink, totalCostMicros } = memorySink();
  const router = createRouter({ config, sink });
  console.log(
    `A1 on ${head.id}/${modelFor(head, "A1")}, A3 on ${head.id}/${modelFor(head, "A3")}${chain[1] ? `, fallback ${chain[1].id}` : ""}`,
  );

  const only = arg("case");
  const cases = only ? EVAL_CASES.filter((c) => c.id === only) : EVAL_CASES;
  const { scores, summary } = await runEval(router, cases, {
    packs: PACKS,
    onCase: (s) => {
      const mark = s.error
        ? "✗"
        : s.fieldHits === s.expected && s.actual === s.expected
          ? "✓"
          : "~";
      const notes = [
        s.missing.length ? `missing ${s.missing.join(", ")}` : "",
        s.extra.length ? `extra ${s.extra.join("; ")}` : "",
        s.detectedPack !== s.pack ? `pack ${s.detectedPack ?? "none"}` : "",
        s.error ? `error ${s.error}` : "",
      ].filter(Boolean);
      console.log(
        `${mark} ${s.id.padEnd(20)} ${s.fieldHits}/${s.expected} field, ${s.exactHits}/${s.expected} exact, ${s.actual} hard${notes.length ? `  ${notes.join(" · ")}` : ""}`,
      );
    },
  });

  console.log("");
  for (const [pack, r] of Object.entries(summary.byPack)) {
    console.log(
      `  ${pack.padEnd(12)} ${r.cases} briefs  field P ${pct(r.field.precision)} R ${pct(r.field.recall)}  exact P ${pct(r.exact.precision)} R ${pct(r.exact.recall)}`,
    );
  }
  console.log(
    `  ${"all".padEnd(12)} ${summary.cases} briefs  field P ${pct(summary.field.precision)} R ${pct(summary.field.recall)}  exact P ${pct(summary.exact.precision)} R ${pct(summary.exact.recall)}  pack ${pct(summary.packAccuracy)}  errors ${summary.errors}`,
  );

  let injectionPassed = true;
  const injection = [];
  if (!flag("no-injection") && !only) {
    console.log("\nInjection (A3):");
    for (const c of INJECTION_CASES) {
      const r = await runInjectionCase(router, c, PACKS);
      injection.push(r);
      injectionPassed &&= r.passed;
      const notes = [
        r.sameFacts ? "" : "facts changed",
        r.expectedFound ? "" : "expected value missing",
        r.fromInjection.length
          ? `used planted text: ${r.fromInjection.join("; ")}`
          : "",
        r.unrequested.length
          ? `unrequested (dropped): ${r.unrequested.join(", ")}`
          : "",
        r.error ? `error ${r.error}` : "",
      ].filter(Boolean);
      console.log(
        `${r.passed ? "✓" : "✗"} ${r.id.padEnd(20)} ${notes.join(" · ")}`,
      );
    }
  }

  const passed = summary.passed && injectionPassed;
  console.log(
    `\n${passed ? "✓" : "✗"} target ≥ ${pct(EVAL_TARGET)} field-level P/R on hard requirements${flag("no-injection") || only ? "" : ", injection set clean"} · spend ${formatUsd(totalCostMicros())}`,
  );
  const out = arg("out");
  if (out) {
    writeFileSync(
      out,
      `${JSON.stringify({ provider: head.id, model: modelFor(head, "A1"), summary, scores, injection }, null, 2)}\n`,
    );
    console.log(`wrote ${out}`);
  }
  process.exit(passed ? 0 : 1);
}

await main();
