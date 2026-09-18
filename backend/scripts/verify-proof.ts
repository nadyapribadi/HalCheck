// Verifies a proof bundle with no application, no backend, no ledger client
// and no login (ADR-CT-034). This file is the whole verifier's dependency
// surface: one JSON file in, one printed report out, an exit code a script
// can gate on.
//
//   npm run verify:proof -- path/to/proof-bundle.json
//
// It shares its logic with the browser's /verify screen
// (src/proof/verifyProofBundle.ts), so a regulator, an auditor or a curious
// customer gets the same answer from either route -- and can read the code
// that produced it.
import { readFileSync } from "node:fs";
import { verifyProofBundle, ProofBundleFormatError } from "../../src/proof/verifyProofBundle";

const SYMBOL: Record<string, string> = { pass: "PASS", fail: "FAIL", info: "note" };

async function main(): Promise<void> {
  const path = process.argv[2];
  if (!path) {
    console.error("usage: npm run verify:proof -- <proof-bundle.json>");
    process.exit(2);
  }

  let bundle: unknown;
  try {
    bundle = JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    console.error(`could not read ${path}: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(2);
  }

  let report;
  try {
    report = await verifyProofBundle(bundle);
  } catch (err) {
    if (err instanceof ProofBundleFormatError) {
      console.error(`not a proof bundle: ${err.message}`);
      process.exit(2);
    }
    throw err;
  }

  console.log(`\nProof bundle for batch ${report.batchId}\n`);
  for (const check of report.checks) {
    console.log(`  [${SYMBOL[check.status] ?? check.status}] ${check.label}`);
    console.log(`         ${check.detail}`);
  }

  const failures = report.checks.filter((check) => check.status === "fail").length;
  console.log(
    report.ok
      ? `\nVERIFIED -- ${report.checks.length} checks, 0 failures. The records, the batch digest and the signed verdict all agree.`
      : `\nNOT VERIFIED -- ${failures} of ${report.checks.length} checks failed. Do not treat this bundle as evidence.`,
  );
  process.exit(report.ok ? 0 : 1);
}

void main();
