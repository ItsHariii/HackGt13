import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { unzipSync } from "fflate";
import { formatReport, type ReadFile, verifyPack } from "./verify";

/*
 * Entry point of `verify.mjs`, bundled by scripts/bundle-verify.mjs into one
 * file with no dependencies and no network use.
 *
 *   node verify.mjs              checks the pack in this file's folder
 *   node verify.mjs <folder>     checks an unzipped pack elsewhere
 *   node verify.mjs <pack.zip>   checks a zip without unzipping it
 */

function reader(target: string): ReadFile {
  if (statSync(target).isFile()) {
    const files = unzipSync(new Uint8Array(readFileSync(target)));
    return (path) => files[path];
  }
  return (path) => {
    const full = join(target, ...path.split("/"));
    return existsSync(full) ? new Uint8Array(readFileSync(full)) : undefined;
  };
}

async function main() {
  const arg = process.argv[2];
  const target = arg ? resolve(arg) : dirname(fileURLToPath(import.meta.url));
  if (!existsSync(target)) {
    console.error(`No such file or folder: ${target}`);
    process.exit(2);
  }
  const report = await verifyPack(reader(target));
  console.log(formatReport(report));
  process.exit(report.ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
